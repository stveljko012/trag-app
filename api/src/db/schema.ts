import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// Source of truth for Trag's own database. After changing it, run `npm run db:generate -w @trag/api`
// to create a migration in api/drizzle/; the API applies pending migrations on startup.

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  'users',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    role: text('role', { enum: ['owner', 'viewer'] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check('users_email_lowercase', sql`${t.email} = lower(${t.email})`),
    check('users_role_valid', sql`${t.role} IN ('owner', 'viewer')`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check('sessions_id_format', sql`${t.id} ~ '^[0-9a-f]{64}$'`),
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);

/** Business data for client sites. The shape itself lives in a Traccar geofence. */
export const locations = pgTable(
  'locations',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    traccarGeofenceId: integer('traccar_geofence_id').notNull().unique(),
    name: text('name').notNull(),
    address: text('address'),
    notes: text('notes'),
    hourlyRate: numeric('hourly_rate', { precision: 10, scale: 2, mode: 'number' }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('locations_hourly_rate_non_negative', sql`${t.hourlyRate} >= 0`)],
);

/** deviceId is a Traccar device id; no FK because devices live in Traccar. */
export const visits = pgTable(
  'visits',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    deviceId: integer('device_id').notNull(),
    locationId: integer('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    arrivedAt: timestamp('arrived_at', { withTimezone: true }).notNull(),
    leftAt: timestamp('left_at', { withTimezone: true }),
    durationS: integer('duration_s'),
  },
  (t) => [
    unique('visits_device_location_arrival_unique').on(t.deviceId, t.locationId, t.arrivedAt),
    check('visits_left_after_arrival', sql`${t.leftAt} IS NULL OR ${t.leftAt} >= ${t.arrivedAt}`),
    check('visits_duration_non_negative', sql`${t.durationS} >= 0`),
    index('visits_arrived_at_idx').on(t.arrivedAt),
    index('visits_location_id_idx').on(t.locationId),
    index('visits_open_idx')
      .on(t.deviceId, t.locationId)
      .where(sql`${t.leftAt} IS NULL`),
  ],
);

/** Raw Traccar webhook payloads. dedupeKey makes redelivery idempotent. */
export const eventsInbox = pgTable(
  'events_inbox',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    dedupeKey: text('dedupe_key').unique(),
    payload: jsonb('payload').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error'),
  },
  (t) => [
    index('events_inbox_unprocessed_idx')
      .on(t.receivedAt)
      .where(sql`${t.processedAt} IS NULL`),
  ],
);

/** Drivers are managed in Trag only; Traccar's drivers are for hardware ID (iButton/RFID). */
export const drivers = pgTable('drivers', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  phone: text('phone'),
  notes: text('notes'),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Who drove which vehicle when; endedAt null means the assignment is current. The partial unique
 * indexes allow one current assignment per vehicle and per driver. History stays non-overlapping
 * because assignments are only ever closed and opened at "now" (see drivers/drivers.ts).
 */
export const driverAssignments = pgTable(
  'driver_assignments',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    driverId: integer('driver_id')
      .notNull()
      .references(() => drivers.id, { onDelete: 'restrict' }),
    deviceId: integer('device_id').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [
    check(
      'driver_assignments_ends_after_start',
      sql`${t.endedAt} IS NULL OR ${t.endedAt} > ${t.startedAt}`,
    ),
    uniqueIndex('driver_assignments_current_per_device')
      .on(t.deviceId)
      .where(sql`${t.endedAt} IS NULL`),
    uniqueIndex('driver_assignments_current_per_driver')
      .on(t.driverId)
      .where(sql`${t.endedAt} IS NULL`),
    index('driver_assignments_device_started_idx').on(t.deviceId, t.startedAt),
  ],
);
