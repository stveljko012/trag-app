import type { VehicleDto } from './vehicles.js';

type Listener = (vehicle: VehicleDto) => void;

/**
 * Fans forwarded positions out to the open map tabs (GET /api/live). In memory, which is enough
 * while each client runs one Trag instance.
 */
export class LiveHub {
  private readonly listeners = new Set<Listener>();
  private readonly closers = new Set<() => void>();
  // Latest fix time sent per device; Traccar also forwards old positions buffered by a device.
  private readonly lastFix = new Map<number, number>();

  /** Whether a position is newer than the last one sent for its device; records it if so. */
  accept(deviceId: number, fixTime: string): boolean {
    const time = Date.parse(fixTime);
    if (Number.isNaN(time)) return false;
    const last = this.lastFix.get(deviceId);
    if (last !== undefined && time <= last) return false;
    this.lastFix.set(deviceId, time);
    return true;
  }

  publish(vehicle: VehicleDto) {
    for (const listener of this.listeners) listener(vehicle);
  }

  /** `onClose` runs when the server shuts down, so open streams end instead of holding it up. */
  subscribe(listener: Listener, onClose: () => void): () => void {
    this.listeners.add(listener);
    this.closers.add(onClose);
    return () => {
      this.listeners.delete(listener);
      this.closers.delete(onClose);
    };
  }

  get size() {
    return this.listeners.size;
  }

  close() {
    for (const close of [...this.closers]) close();
  }
}
