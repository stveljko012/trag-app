import { and, asc, eq, gt, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { driverAssignments, drivers } from '../db/schema.js';

// Drivers live only in Trag's database; assignments to Traccar devices keep their history.
// Every change closes the current assignment and opens a new one at the same instant, so the
// history never overlaps. Concurrent changes are serialized with row and advisory locks.

export interface DriverRef {
  id: number;
  name: string;
  phone: string | null;
}

export interface DriverDto extends DriverRef {
  notes: string | null;
  active: boolean;
  /** Traccar device id of the vehicle the driver currently drives. */
  vehicleId: number | null;
  since: string | null;
}

export interface DriverInput {
  name?: string;
  phone?: string | null;
  notes?: string | null;
  active?: boolean;
}

export class DriverNotFoundError extends Error {
  constructor() {
    super('Vozač nije pronađen');
  }
}

export class DriverInactiveError extends Error {
  constructor() {
    super('Vozač nije aktivan');
  }
}

export class DriverHasHistoryError extends Error {
  constructor() {
    super('Vozač ima istoriju vožnji i ne može da se obriše. Deaktivirajte ga umesto toga.');
  }
}

// Advisory lock namespace for "assignments of device N" (first key of the two-int form).
const DEVICE_LOCK_NAMESPACE = 41_001;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const currentAssignment = and(
  eq(driverAssignments.driverId, drivers.id),
  isNull(driverAssignments.endedAt),
);

export async function listDrivers(db: Db): Promise<DriverDto[]> {
  const rows = await db
    .select({
      id: drivers.id,
      name: drivers.name,
      phone: drivers.phone,
      notes: drivers.notes,
      active: drivers.active,
      vehicleId: driverAssignments.deviceId,
      since: driverAssignments.startedAt,
    })
    .from(drivers)
    .leftJoin(driverAssignments, currentAssignment)
    .orderBy(asc(drivers.name));
  return rows.map((r) => ({ ...r, since: r.since?.toISOString() ?? null }));
}

async function getDriver(db: Db, id: number): Promise<DriverDto> {
  const driver = (await listDrivers(db)).find((d) => d.id === id);
  if (!driver) throw new DriverNotFoundError();
  return driver;
}

export async function createDriver(
  db: Db,
  input: DriverInput & { name: string },
): Promise<DriverDto> {
  const [row] = await db
    .insert(drivers)
    .values({ name: input.name, phone: input.phone ?? null, notes: input.notes ?? null })
    .returning({ id: drivers.id });
  return getDriver(db, row!.id);
}

/** Updates fields that are not undefined. Deactivating a driver ends their current assignment. */
export async function updateDriver(db: Db, id: number, input: DriverInput): Promise<DriverDto> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(drivers)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(drivers.id, id))
      .returning({ active: drivers.active });
    if (!row) throw new DriverNotFoundError();
    if (!row.active) await endAssignments(tx, { driverId: id }, new Date());
  });
  return getDriver(db, id);
}

/**
 * Deletes a driver who never drove. A driver with assignment history is kept (deactivate instead),
 * so past trips stay attributed to them.
 */
export async function deleteDriver(db: Db, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    // Same row lock as assignDriver, so no assignment can be added between the check and delete.
    const [driver] = await tx
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.id, id))
      .for('update');
    if (!driver) throw new DriverNotFoundError();
    const [used] = await tx
      .select({ id: driverAssignments.id })
      .from(driverAssignments)
      .where(eq(driverAssignments.driverId, id))
      .limit(1);
    if (used) throw new DriverHasHistoryError();
    await tx.delete(drivers).where(eq(drivers.id, id));
  });
}

async function endAssignments(
  tx: Tx,
  who: { deviceId?: number; driverId?: number },
  at: Date,
): Promise<void> {
  const target = or(
    who.deviceId !== undefined ? eq(driverAssignments.deviceId, who.deviceId) : undefined,
    who.driverId !== undefined ? eq(driverAssignments.driverId, who.driverId) : undefined,
  );
  const open = and(isNull(driverAssignments.endedAt), target);
  // An assignment that started at this very instant (double click) is replaced, not ended.
  await tx.delete(driverAssignments).where(and(open, gte(driverAssignments.startedAt, at)));
  await tx.update(driverAssignments).set({ endedAt: at }).where(open);
}

/**
 * Makes `driverId` the current driver of `deviceId` (null: no driver). A driver who was driving
 * another vehicle is moved, so that vehicle is left without a driver.
 */
export async function assignDriver(
  db: Db,
  deviceId: number,
  driverId: number | null,
  at: Date = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    // Serialize changes per vehicle, including when it has no assignment row to lock.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${DEVICE_LOCK_NAMESPACE}, ${deviceId})`);
    if (driverId !== null) {
      const [driver] = await tx
        .select({ active: drivers.active })
        .from(drivers)
        .where(eq(drivers.id, driverId))
        .for('update');
      if (!driver) throw new DriverNotFoundError();
      if (!driver.active) throw new DriverInactiveError();
    }

    await endAssignments(tx, { deviceId, driverId: driverId ?? undefined }, at);
    if (driverId !== null) {
      await tx.insert(driverAssignments).values({ driverId, deviceId, startedAt: at });
    }
  });
}

/** Current driver per Traccar device id. */
export async function currentDrivers(db: Db): Promise<Map<number, DriverRef>> {
  const rows = await db
    .select({
      deviceId: driverAssignments.deviceId,
      id: drivers.id,
      name: drivers.name,
      phone: drivers.phone,
    })
    .from(driverAssignments)
    .innerJoin(drivers, eq(drivers.id, driverAssignments.driverId))
    .where(isNull(driverAssignments.endedAt));
  return new Map(rows.map(({ deviceId, ...driver }) => [deviceId, driver]));
}

export interface AssignmentPeriod {
  deviceId: number;
  driver: DriverRef;
  startedAt: Date;
  endedAt: Date | null;
}

/** Assignments of the given devices that overlap [from, to]. */
export async function assignmentsBetween(
  db: Db,
  deviceIds: number[],
  from: Date,
  to: Date,
): Promise<AssignmentPeriod[]> {
  if (deviceIds.length === 0) return [];
  const rows = await db
    .select({
      deviceId: driverAssignments.deviceId,
      startedAt: driverAssignments.startedAt,
      endedAt: driverAssignments.endedAt,
      id: drivers.id,
      name: drivers.name,
      phone: drivers.phone,
    })
    .from(driverAssignments)
    .innerJoin(drivers, eq(drivers.id, driverAssignments.driverId))
    .where(
      and(
        inArray(driverAssignments.deviceId, deviceIds),
        lt(driverAssignments.startedAt, to),
        or(isNull(driverAssignments.endedAt), gt(driverAssignments.endedAt, from)),
      ),
    );
  return rows.map(({ deviceId, startedAt, endedAt, ...driver }) => ({
    deviceId,
    startedAt,
    endedAt,
    driver,
  }));
}

/** The driver assigned to `deviceId` at `time`, from periods loaded with assignmentsBetween. */
export function driverAt(
  periods: AssignmentPeriod[],
  deviceId: number,
  time: Date,
): DriverRef | null {
  const t = time.getTime();
  const period = periods.find(
    (p) =>
      p.deviceId === deviceId &&
      p.startedAt.getTime() <= t &&
      (p.endedAt === null || p.endedAt.getTime() > t),
  );
  return period?.driver ?? null;
}
