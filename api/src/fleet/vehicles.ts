import type { DriverRef } from '../drivers/drivers.js';
import type { Device, Geofence, Position, Stop } from '../traccar/traccar.js';
import { knotsToKmh, round } from '../traccar/units.js';
import { iso } from './reports.js';

export type VehicleState = 'moving' | 'stopped' | 'offline';

/** Below this speed a vehicle counts as stopped; filters GPS jitter while parked. */
export const MOVING_SPEED_KMH = 3;

/** A stop counts as ongoing when it ends this close to the latest fix. */
const ONGOING_STOP_TOLERANCE_MS = 2 * 60 * 1000;

export interface VehicleDto {
  id: number;
  name: string;
  model: string | null;
  category: string | null;
  state: VehicleState;
  /** Alarm on the latest position, e.g. "tow", "powerCut". */
  alarm: string | null;
  lastUpdate: string | null;
  /** Start of the current stop, when stopped. */
  stoppedSince: string | null;
  /** Names of the locations (geofences) the vehicle is in. */
  locations: string[];
  driver: DriverRef | null;
  position: {
    lat: number;
    lng: number;
    speedKmh: number;
    course: number;
    ignition: boolean | null;
    fixTime: string;
    address: string | null;
  } | null;
}

export interface VehicleContext {
  geofences?: Map<number, Geofence>;
  /** Recent stops for all devices; used to work out how long a vehicle has been stopped. */
  stops?: Stop[];
  /** Current driver per device id. */
  drivers?: Map<number, DriverRef>;
}

function currentStopStart(deviceId: number, fixTime: string, stops: Stop[]): string | null {
  const fix = new Date(fixTime).getTime();
  let latest: Stop | undefined;
  for (const s of stops) {
    if (s.deviceId !== deviceId) continue;
    if (!latest || s.startTime > latest.startTime) latest = s;
  }
  if (!latest || new Date(latest.endTime).getTime() < fix - ONGOING_STOP_TOLERANCE_MS) return null;
  return iso(latest.startTime);
}

export function toVehicle(
  device: Device,
  position: Position | undefined,
  context: VehicleContext = {},
): VehicleDto {
  const speedKmh = position ? round(knotsToKmh(position.speed ?? 0)) : 0;
  const ignition = position?.attributes?.ignition;
  const alarm = position?.attributes?.alarm;
  const state: VehicleState =
    device.status !== 'online' ? 'offline' : speedKmh >= MOVING_SPEED_KMH ? 'moving' : 'stopped';

  return {
    id: device.id,
    name: device.name,
    model: device.model ?? null,
    category: device.category ?? null,
    state,
    alarm: typeof alarm === 'string' && alarm ? alarm : null,
    lastUpdate: device.lastUpdate ? iso(device.lastUpdate) : null,
    stoppedSince:
      position && state !== 'moving' && context.stops
        ? currentStopStart(device.id, position.fixTime, context.stops)
        : null,
    locations: (position?.geofenceIds ?? [])
      .map((id) => context.geofences?.get(id)?.name)
      .filter((name): name is string => !!name),
    driver: context.drivers?.get(device.id) ?? null,
    position: position
      ? {
          lat: position.latitude,
          lng: position.longitude,
          speedKmh,
          course: position.course ?? 0,
          ignition: typeof ignition === 'boolean' ? ignition : null,
          fixTime: iso(position.fixTime),
          address: position.address ?? null,
        }
      : null,
  };
}

export function toVehicles(
  devices: Device[],
  positions: Position[],
  context: VehicleContext = {},
): VehicleDto[] {
  const byDevice = new Map(positions.map((p) => [p.deviceId, p]));
  return devices
    .filter((d) => !d.disabled)
    .map((d) => toVehicle(d, byDevice.get(d.id), context))
    .sort((a, b) => a.name.localeCompare(b.name, 'sr'));
}

/** Gaps longer than this between fixes are not counted as engine time (lost signal). */
const MAX_ENGINE_GAP_MS = 10 * 60 * 1000;

/** Seconds with ignition on, summed over consecutive positions. */
export function engineSeconds(positions: Position[]): number {
  const sorted = [...positions].sort((a, b) => a.fixTime.localeCompare(b.fixTime));
  let ms = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    if (prev.attributes?.ignition !== true) continue;
    const gap = new Date(sorted[i]!.fixTime).getTime() - new Date(prev.fixTime).getTime();
    if (gap > 0 && gap <= MAX_ENGINE_GAP_MS) ms += gap;
  }
  return Math.round(ms / 1000);
}
