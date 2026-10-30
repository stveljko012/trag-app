import type { Vehicle, VehicleState } from '../api/types';
import { alarmLabel } from './events';
import { formatDuration } from './time';

/** What the UI shows: offline wins over an alarm, an alarm wins over moving/stopped. */
export type DisplayState = VehicleState | 'alarm';

export const STATE_LABEL: Record<DisplayState, string> = {
  moving: 'U vožnji',
  stopped: 'Stoji',
  alarm: 'Alarm',
  offline: 'Van mreže',
};

export function displayState(v: Vehicle): DisplayState {
  if (v.state === 'offline') return 'offline';
  if (v.alarm) return 'alarm';
  return v.state;
}

const ALARM_SHORT: Record<string, string> = { tow: 'Šlepanje?' };

/** Short status for list rows and markers: "64 km/h", "Stoji 45 min", "Šlepanje?". */
export function statusText(v: Vehicle, now: number = Date.now()): string {
  const state = displayState(v);
  if (state === 'alarm') return ALARM_SHORT[v.alarm!] ?? alarmLabel(v.alarm!);
  if (state === 'moving') return `${Math.round(v.position?.speedKmh ?? 0)} km/h`;
  if (state === 'offline') return 'Van mreže';
  if (v.locations.length) return 'Na lokaciji';
  if (v.stoppedSince) {
    const s = Math.max(0, Math.round((now - new Date(v.stoppedSince).getTime()) / 1000));
    return `Stoji ${formatDuration(s < 60 ? 60 : s)}`;
  }
  return 'Stoji';
}

/** Where the vehicle is: location name, address, or coordinates. */
export function placeText(v: Vehicle): string {
  if (v.locations.length) return v.locations.join(', ');
  if (v.position?.address) return v.position.address;
  if (v.position) return `${v.position.lat.toFixed(5)}, ${v.position.lng.toFixed(5)}`;
  return 'Nema pozicije';
}

export function ignitionLabel(ignition: boolean | null): string {
  if (ignition === null) return 'Nepoznato';
  return ignition ? 'Upaljen' : 'Ugašen';
}
