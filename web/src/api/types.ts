// Mirrors the API's response shapes (api/src/fleet).

export type VehicleState = 'moving' | 'stopped' | 'offline';

export interface DriverRef {
  id: number;
  name: string;
  phone: string | null;
}

export interface Driver extends DriverRef {
  notes: string | null;
  active: boolean;
  /** Vehicle (Traccar device id) the driver currently drives. */
  vehicleId: number | null;
  since: string | null;
}

export interface Vehicle {
  id: number;
  name: string;
  model: string | null;
  category: string | null;
  state: VehicleState;
  /** Alarm on the latest position, e.g. "tow". */
  alarm: string | null;
  lastUpdate: string | null;
  stoppedSince: string | null;
  /** Names of the locations the vehicle is currently in. */
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

export interface RoutePoint {
  time: string;
  lat: number;
  lng: number;
  speedKmh: number;
}

export interface Place {
  lat: number | null;
  lng: number | null;
  address: string | null;
}

export interface Trip {
  vehicleId: number;
  startTime: string;
  endTime: string;
  durationS: number;
  distanceKm: number;
  maxSpeedKmh: number;
  averageSpeedKmh: number;
  start: Place;
  end: Place;
  /** Driver assigned when the trip started. */
  driver: DriverRef | null;
}

export interface Stop extends Place {
  vehicleId: number;
  startTime: string;
  endTime: string;
  durationS: number;
}

export interface FleetEvent {
  id: number;
  type: string;
  time: string;
  vehicleId: number;
  vehicleName: string | null;
  geofenceId: number | null;
  geofenceName: string | null;
  alarm: string | null;
  speedKmh: number | null;
}

export interface VehicleToday {
  distanceKm: number;
  engineS: number;
}

export type Shape =
  | { type: 'circle'; lat: number; lng: number; radiusM: number }
  | { type: 'polygon'; points: [number, number][] }
  | { type: 'line'; points: [number, number][] };

export interface Location {
  id: number;
  geofenceId: number;
  name: string;
  address: string | null;
  notes: string | null;
  hourlyRate: number | null;
  /** null when Traccar has a shape we don't draw. */
  shape: Shape | null;
}

/** Body for create/update; snake_case like the API. */
export interface LocationInput {
  name: string;
  lat?: number;
  lng?: number;
  radius_m?: number;
  address: string | null;
  notes: string | null;
  hourly_rate: number | null;
}
