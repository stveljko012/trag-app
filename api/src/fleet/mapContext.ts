import type { Db } from '../db/client.js';
import { currentDrivers } from '../drivers/drivers.js';
import type { Stop, TraccarClient } from '../traccar/traccar.js';
import type { VehicleContext } from './vehicles.js';

/** How long locations, drivers and recent stops are reused before they are loaded again. */
export const MAP_CONTEXT_TTL_MS = 60_000;
// Stops of the last day, used for "stopped for N min".
const STOPS_WINDOW_MS = 24 * 60 * 60 * 1000;

/** A value loaded on demand and reused for `ttlMs`; concurrent callers share one load. */
class Cached<T> {
  private entry: { at: number; value: Promise<T> } | undefined;

  constructor(
    private readonly ttlMs: number,
    private readonly load: () => Promise<T>,
    private readonly now: () => number,
  ) {}

  get(): Promise<T> {
    if (this.entry && this.now() - this.entry.at < this.ttlMs) return this.entry.value;
    const entry = { at: this.now(), value: this.load() };
    this.entry = entry;
    // A failed load is not cached; the next caller tries again.
    entry.value.catch(() => {
      if (this.entry === entry) this.entry = undefined;
    });
    return entry.value;
  }

  invalidate() {
    this.entry = undefined;
  }
}

/**
 * What the live map adds to Traccar's devices and positions: location names, current drivers
 * and recent stops. In memory, shared by GET /vehicles and the position webhook, so a forwarded
 * position needs no query. Only the map uses it; other pages read fresh data.
 */
export class MapContext {
  private readonly geofences: Cached<VehicleContext['geofences']>;
  private readonly drivers: Cached<VehicleContext['drivers']>;
  private readonly stops: Cached<Stop[] | undefined>;
  private lastStops: Stop[] | undefined;
  // Devices whose stops are loaded; set by GET /vehicles, which lists them all.
  private deviceIds: number[] = [];

  constructor(
    traccar: TraccarClient,
    db: Db,
    { ttlMs = MAP_CONTEXT_TTL_MS, now = Date.now }: { ttlMs?: number; now?: () => number } = {},
  ) {
    this.geofences = new Cached(
      ttlMs,
      async () => new Map((await traccar.getGeofences()).map((g) => [g.id, g])),
      now,
    );
    this.drivers = new Cached(ttlMs, () => currentDrivers(db), now);
    this.stops = new Cached(
      ttlMs,
      async () => {
        if (!this.deviceIds.length) return undefined;
        try {
          const to = new Date(now());
          this.lastStops = await traccar.getStops(
            this.deviceIds,
            new Date(to.getTime() - STOPS_WINDOW_MS),
            to,
          );
        } catch (err) {
          // Nice to have; the map must still load without it.
          console.error('Loading recent stops failed', err);
        }
        return this.lastStops;
      },
      now,
    );
  }

  /** Context for these devices; pass every device so the stops cover the whole fleet. */
  async get(deviceIds?: number[]): Promise<VehicleContext> {
    if (deviceIds && deviceIds.some((id) => !this.deviceIds.includes(id))) {
      this.deviceIds = deviceIds;
      this.stops.invalidate();
    }
    const [geofences, drivers, stops] = await Promise.all([
      this.geofences.get(),
      this.drivers.get(),
      this.stops.get(),
    ]);
    return { geofences, drivers, stops };
  }

  /** A location was created, changed or deleted in Trag. */
  invalidateGeofences() {
    this.geofences.invalidate();
  }

  /** A driver was assigned, renamed or removed in Trag. */
  invalidateDrivers() {
    this.drivers.invalidate();
  }
}
