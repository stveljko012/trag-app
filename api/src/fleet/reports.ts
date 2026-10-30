import type { DriverRef } from '../drivers/drivers.js';
import type { Event, Geofence, Position, Stop, Trip } from '../traccar/traccar.js';
import { knotsToKmh, metersToKm, msToSeconds, round } from '../traccar/units.js';

/** Traccar sends "+00:00" offsets; normalize to toISOString() so times compare as strings. */
export function iso(time: string): string {
  return new Date(time).toISOString();
}

/** True for fixes worth drawing: valid GPS and not the 0,0 "no fix" placeholder. */
export function isUsableFix(p: Position): boolean {
  return p.valid !== false && !(p.latitude === 0 && p.longitude === 0);
}

export interface RoutePointDto {
  time: string;
  lat: number;
  lng: number;
  speedKmh: number;
}

export function toRoutePoints(positions: Position[]): RoutePointDto[] {
  return positions
    .filter(isUsableFix)
    .map((p) => ({
      time: iso(p.fixTime),
      lat: p.latitude,
      lng: p.longitude,
      speedKmh: round(knotsToKmh(p.speed ?? 0)),
    }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export interface TripDto {
  vehicleId: number;
  startTime: string;
  endTime: string;
  durationS: number;
  distanceKm: number;
  maxSpeedKmh: number;
  averageSpeedKmh: number;
  start: { lat: number | null; lng: number | null; address: string | null };
  end: { lat: number | null; lng: number | null; address: string | null };
  /** Driver assigned in Trag when the trip started. */
  driver: DriverRef | null;
}

export function toTrip(t: Trip, driver: DriverRef | null = null): TripDto {
  return {
    vehicleId: t.deviceId,
    startTime: iso(t.startTime),
    endTime: iso(t.endTime),
    durationS: msToSeconds(t.duration ?? 0),
    distanceKm: round(metersToKm(t.distance ?? 0), 2),
    maxSpeedKmh: round(knotsToKmh(t.maxSpeed ?? 0)),
    averageSpeedKmh: round(knotsToKmh(t.averageSpeed ?? 0)),
    start: { lat: t.startLat ?? null, lng: t.startLon ?? null, address: t.startAddress ?? null },
    end: { lat: t.endLat ?? null, lng: t.endLon ?? null, address: t.endAddress ?? null },
    driver,
  };
}

export interface StopDto {
  vehicleId: number;
  startTime: string;
  endTime: string;
  durationS: number;
  lat: number | null;
  lng: number | null;
  address: string | null;
}

export function toStop(s: Stop): StopDto {
  return {
    vehicleId: s.deviceId,
    startTime: iso(s.startTime),
    endTime: iso(s.endTime),
    durationS: msToSeconds(s.duration ?? 0),
    lat: s.latitude ?? s.lat ?? null,
    lng: s.longitude ?? s.lon ?? null,
    address: s.address ?? null,
  };
}

export interface EventDto {
  id: number;
  type: string;
  time: string;
  vehicleId: number;
  vehicleName: string | null;
  geofenceId: number | null;
  geofenceName: string | null;
  /** Alarm subtype for `alarm` events, e.g. "tow" or "powerCut". */
  alarm: string | null;
  speedKmh: number | null;
}

export function toEvent(
  e: Event,
  deviceNames: Map<number, string>,
  geofences: Map<number, Geofence>,
): EventDto {
  const attrs = e.attributes ?? {};
  const speed = typeof attrs.speed === 'number' ? round(knotsToKmh(attrs.speed)) : null;
  return {
    id: e.id,
    type: e.type,
    time: iso(e.eventTime),
    vehicleId: e.deviceId,
    vehicleName: deviceNames.get(e.deviceId) ?? null,
    geofenceId: e.geofenceId || null,
    geofenceName: e.geofenceId ? (geofences.get(e.geofenceId)?.name ?? null) : null,
    alarm: typeof attrs.alarm === 'string' ? attrs.alarm : null,
    speedKmh: speed,
  };
}
