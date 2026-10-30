import type { Vehicle } from '../api/types';
import { displayState, type DisplayState, placeText } from './vehicleState';

export type Filter = 'all' | DisplayState;
export const FILTERS: Filter[] = ['all', 'moving', 'stopped', 'alarm', 'offline'];

export function filterVehicles(vehicles: Vehicle[], filter: Filter, query: string): Vehicle[] {
  const q = query.trim().toLowerCase();
  return vehicles.filter(
    (v) =>
      (filter === 'all' || displayState(v) === filter) &&
      (!q ||
        [v.name, v.model ?? '', v.driver?.name ?? '', placeText(v)].some((text) =>
          text.toLowerCase().includes(q),
        )),
  );
}

export function countByState(vehicles: Vehicle[]): Record<DisplayState, number> {
  const counts = { moving: 0, stopped: 0, alarm: 0, offline: 0 };
  for (const v of vehicles) counts[displayState(v)]++;
  return counts;
}

/** "3 u vožnji · 3 stoje · 1 alarm · 1 van mreže" */
export function summaryText(counts: Record<DisplayState, number>): string {
  return [
    `${counts.moving} u vožnji`,
    `${counts.stopped} ${counts.stopped === 1 ? 'stoji' : 'stoje'}`,
    `${counts.alarm} ${counts.alarm === 1 ? 'alarm' : 'alarma'}`,
    `${counts.offline} van mreže`,
  ].join(' · ');
}
