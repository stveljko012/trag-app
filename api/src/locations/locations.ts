import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { locations } from '../db/schema.js';
import type { Geofence, TraccarClient } from '../traccar/traccar.js';
import { TraccarError } from '../traccar/traccar.js';
import { circleWkt, parseArea, type Shape } from '../traccar/wkt.js';

// A location is a Traccar geofence (the shape, and the name Traccar shows) plus our row with the
// business data. Traccar is written first; our row follows, and is rolled back on failure.

export interface LocationDto {
  id: number;
  geofenceId: number;
  name: string;
  address: string | null;
  notes: string | null;
  hourlyRate: number | null;
  shape: Shape | null;
}

type LocationRow = typeof locations.$inferSelect;

export interface LocationDetails {
  address?: string | null;
  notes?: string | null;
  hourlyRate?: number | null;
}

export interface CircleInput {
  lat: number;
  lng: number;
  radiusM: number;
}

export class LocationNotFoundError extends Error {
  constructor() {
    super('Lokacija nije pronađena');
  }
}

export class ShapeNotEditableError extends Error {
  constructor() {
    super('Oblik ove lokacije nije krug i menja se samo u Traccaru');
  }
}

function toDto(row: LocationRow, geofence: Geofence | undefined): LocationDto {
  return {
    id: row.id,
    geofenceId: row.traccarGeofenceId,
    name: row.name,
    address: row.address,
    notes: row.notes,
    hourlyRate: row.hourlyRate,
    shape: geofence ? parseArea(geofence.area) : null,
  };
}

async function findRow(db: Db, id: number): Promise<LocationRow> {
  const [row] = await db.select().from(locations).where(eq(locations.id, id));
  if (!row) throw new LocationNotFoundError();
  return row;
}

export async function listLocations(db: Db, traccar: TraccarClient): Promise<LocationDto[]> {
  const geofences = await traccar.getGeofences();
  // Geofences made directly in Traccar get a row on first sight, so they can be edited here too.
  if (geofences.length) {
    await db
      .insert(locations)
      .values(geofences.map((g) => ({ traccarGeofenceId: g.id, name: g.name })))
      .onConflictDoNothing({ target: locations.traccarGeofenceId });
  }
  const rows = await db.select().from(locations);
  const byId = new Map(geofences.map((g) => [g.id, g]));
  // Rows whose geofence is gone from Traccar are kept (for history) but not listed.
  return rows
    .filter((r) => byId.has(r.traccarGeofenceId))
    .map((r) => toDto(r, byId.get(r.traccarGeofenceId)))
    .sort((a, b) => a.name.localeCompare(b.name, 'sr'));
}

export async function createLocation(
  db: Db,
  traccar: TraccarClient,
  input: { name: string } & CircleInput & LocationDetails,
): Promise<LocationDto> {
  const geofence = await traccar.createGeofence({
    name: input.name,
    area: circleWkt(input.lat, input.lng, input.radiusM),
  });
  try {
    // Single tenant: every device the service user sees should trigger enter/exit events here.
    const devices = await traccar.getDevices();
    await Promise.all(devices.map((d) => traccar.linkGeofenceToDevice(geofence.id, d.id)));

    const details = {
      name: input.name,
      address: input.address ?? null,
      notes: input.notes ?? null,
      hourlyRate: input.hourlyRate ?? null,
    };
    const [row] = await db
      .insert(locations)
      .values({ traccarGeofenceId: geofence.id, ...details })
      .onConflictDoUpdate({
        target: locations.traccarGeofenceId,
        set: { ...details, updatedAt: new Date() },
      })
      .returning();
    return toDto(row!, geofence);
  } catch (err) {
    await traccar.deleteGeofence(geofence.id).catch((cleanupErr: unknown) => {
      console.error(`Could not remove geofence ${geofence.id} after a failed create`, cleanupErr);
    });
    throw err;
  }
}

export async function updateLocation(
  db: Db,
  traccar: TraccarClient,
  id: number,
  input: { name?: string; circle?: CircleInput } & LocationDetails,
): Promise<LocationDto> {
  const row = await findRow(db, id);
  let geofence: Geofence;
  try {
    geofence = await traccar.getGeofence(row.traccarGeofenceId);
  } catch (err) {
    if (err instanceof TraccarError && (err.status === 404 || err.status === 400)) {
      throw new LocationNotFoundError();
    }
    throw err;
  }

  if (input.circle && geofence.area && parseArea(geofence.area)?.type !== 'circle') {
    throw new ShapeNotEditableError();
  }
  const nameChanged = input.name !== undefined && input.name !== geofence.name;
  if (nameChanged || input.circle) {
    geofence = await traccar.updateGeofence({
      ...geofence,
      name: input.name ?? geofence.name,
      area: input.circle
        ? circleWkt(input.circle.lat, input.circle.lng, input.circle.radiusM)
        : geofence.area,
    });
  }

  // Fields left undefined in the input keep their current value.
  const [updated] = await db
    .update(locations)
    .set({
      name: geofence.name,
      address: input.address,
      notes: input.notes,
      hourlyRate: input.hourlyRate,
      updatedAt: new Date(),
    })
    .where(eq(locations.id, id))
    .returning();
  return toDto(updated!, geofence);
}

export async function deleteLocation(db: Db, traccar: TraccarClient, id: number): Promise<void> {
  const row = await findRow(db, id);
  // Traccar answers 204 even when the geofence is already gone.
  await traccar.deleteGeofence(row.traccarGeofenceId);
  await db.delete(locations).where(eq(locations.id, id));
}
