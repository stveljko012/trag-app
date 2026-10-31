// Demo data for screenshots, local only: vehicles that drove real Belgrade roads today, with
// trips, stops, locations and drivers. Traccar computes trips and stops from the positions, as
// for real devices. Needs the dev compose Traccar (OsmAnd on :5055) and an admin TRACCAR_* user.
//
//   npm run -w @trag/api seed:demo            today's history, then exit
//   npm run -w @trag/api seed:demo -- --live  then keep two vehicles driving (Ctrl+C stops)
//   npm run -w @trag/api seed:demo -- --clean remove everything this script created
import { eq, inArray } from 'drizzle-orm';
import { loadConfig } from '../config.js';
import { createDatabase } from '../db/client.js';
import { driverAssignments, drivers, locations } from '../db/schema.js';
import { assignDriver, createDriver } from '../drivers/drivers.js';
import { createLocation, deleteLocation } from '../locations/locations.js';
import { belgradeDay, belgradeDayRange } from '../time/belgrade.js';
import { type Device, TraccarClient } from '../traccar/traccar.js';

const OSMAND_URL = process.env.OSMAND_URL ?? 'http://localhost:5055';
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
// Marks rows this script made, in Traccar (uniqueId prefix) and in Trag (notes).
const DEMO_PREFIX = 'demo-';
const DEMO_NOTE = 'demo-seed';
const STEP_S = 10;
const PARKED_STEP_S = 300;

type Place = { name: string; lat: number; lng: number };
const PLACES = {
  magacin: { name: 'Magacin Zemun', lat: 44.8566, lng: 20.3905 },
  blok65: { name: 'Gradilište Blok 65', lat: 44.8013, lng: 20.3938 },
  banjica: { name: 'Gradilište Banjica', lat: 44.7647, lng: 20.4721 },
  pancevo: { name: 'Klijent Pančevo', lat: 44.8706, lng: 20.6403 },
  surcin: { name: 'Stovarište Surčin', lat: 44.7935, lng: 20.2814 },
  zvezdara: { name: 'Klijent Zvezdara', lat: 44.7988, lng: 20.5043 },
  usce: { name: 'Ušće', lat: 44.8159, lng: 20.4369 },
  obrenovac: { name: 'Obrenovac centar', lat: 44.6555, lng: 20.2003 },
} satisfies Record<string, Place>;
// Only these become Trag locations; the rest are just stops.
const LOCATIONS = [PLACES.magacin, PLACES.blok65, PLACES.banjica, PLACES.pancevo, PLACES.surcin];

const VEHICLES = [
  {
    name: 'BG 1234-AB',
    model: 'Mercedes Sprinter',
    category: 'van',
    driver: 'Marko Petrović',
    day: ['magacin', 'blok65', 'banjica', 'zvezdara', 'magacin'],
  },
  {
    name: 'BG 5678-CD',
    model: 'Iveco Daily',
    category: 'truck',
    driver: 'Nikola Jovanović',
    day: ['magacin', 'pancevo', 'zvezdara', 'pancevo'],
  },
  {
    name: 'BG 9012-EF',
    model: 'VW Caddy',
    category: 'car',
    driver: 'Stefan Ilić',
    day: ['surcin', 'usce', 'banjica', 'blok65', 'surcin'],
  },
  {
    name: 'NS 345-GH',
    model: 'Ford Transit',
    category: 'van',
    driver: 'Milan Đorđević',
    day: ['magacin', 'obrenovac', 'surcin', 'blok65'],
  },
  {
    name: 'BG 678-IJ',
    model: 'Toyota Hilux',
    category: 'pickup',
    driver: 'Ivan Stojanović',
    day: ['banjica', 'zvezdara', 'usce', 'magacin'],
  },
] as const satisfies readonly {
  name: string;
  model: string;
  category: string;
  driver: string;
  day: readonly (keyof typeof PLACES)[];
}[];

const config = loadConfig();
const traccar = new TraccarClient({
  url: config.TRACCAR_URL,
  token: config.TRACCAR_TOKEN,
  user: config.TRACCAR_USER,
  pass: config.TRACCAR_PASS,
});
if (!/localhost|127\.0\.0\.1/.test(config.TRACCAR_URL)) {
  console.error(`Refusing to seed ${config.TRACCAR_URL}: demo data is for a local Traccar only`);
  process.exit(1);
}

// Device create/delete is not part of TraccarClient, which Trag never needs for that.
const auth = config.TRACCAR_TOKEN
  ? `Bearer ${config.TRACCAR_TOKEN}`
  : `Basic ${Buffer.from(`${config.TRACCAR_USER}:${config.TRACCAR_PASS}`).toString('base64')}`;
async function traccarApi<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(config.TRACCAR_URL.replace(/\/+$/, '') + path, {
    method,
    headers: {
      Authorization: auth,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Traccar ${method} ${path}: ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

// ---------------------------------------------------------------------------------------------

type Fix = {
  at: Date;
  lat: number;
  lng: number;
  speedKmh: number;
  course: number;
  ignition: boolean;
};

async function send(uniqueId: string, fix: Fix) {
  const query = new URLSearchParams({
    id: uniqueId,
    timestamp: String(Math.round(fix.at.getTime() / 1000)),
    lat: fix.lat.toFixed(6),
    lon: fix.lng.toFixed(6),
    speed: (fix.speedKmh / 1.852).toFixed(1), // OsmAnd speed is in knots
    bearing: fix.course.toFixed(0),
    ignition: String(fix.ignition),
  });
  const res = await fetch(`${OSMAND_URL}/?${query}`, { method: 'POST' });
  if (!res.ok) throw new Error(`OsmAnd ${res.status} for ${uniqueId}`);
}

type Route = { coords: [number, number][]; durationS: number; distanceM: number };
const routeCache = new Map<string, Route>();

async function route(from: Place, to: Place): Promise<Route> {
  const key = `${from.name}>${to.name}`;
  const cached = routeCache.get(key);
  if (cached) return cached;
  const res = await fetch(
    `${OSRM_URL}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`,
  );
  if (!res.ok) throw new Error(`OSRM ${res.status} for ${key}`);
  const body = (await res.json()) as {
    routes: { geometry: { coordinates: [number, number][] }; duration: number; distance: number }[];
  };
  const r = body.routes[0]!;
  // GeoJSON is [lng, lat].
  const result = {
    coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
    durationS: r.duration,
    distanceM: r.distance,
  };
  routeCache.set(key, result);
  return result;
}

function metersBetween([lat1, lng1]: [number, number], [lat2, lng2]: [number, number]) {
  const rad = Math.PI / 180;
  const x = (lng2 - lng1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  return Math.hypot(x, (lat2 - lat1) * rad) * 6_371_000;
}

function bearing([lat1, lng1]: [number, number], [lat2, lng2]: [number, number]) {
  const rad = Math.PI / 180;
  const y = Math.sin((lng2 - lng1) * rad) * Math.cos(lat2 * rad);
  const x =
    Math.cos(lat1 * rad) * Math.sin(lat2 * rad) -
    Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lng2 - lng1) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

/** Fixes every STEP_S along the route, at OSRM's average speed with some variation. */
function drive(r: Route, start: Date): Fix[] {
  const avgMs = r.distanceM / r.durationS;
  const fixes: Fix[] = [];
  let t = start.getTime();
  let seg = 0;
  let along = 0; // meters into the current segment
  while (seg < r.coords.length - 1) {
    const a = r.coords[seg]!;
    const b = r.coords[seg + 1]!;
    const len = metersBetween(a, b);
    if (along >= len) {
      along -= len;
      seg++;
      continue;
    }
    const f = len ? along / len : 0;
    const speedMs = avgMs * (0.7 + Math.random() * 0.6);
    fixes.push({
      at: new Date(t),
      lat: a[0] + (b[0] - a[0]) * f,
      lng: a[1] + (b[1] - a[1]) * f,
      speedKmh: speedMs * 3.6,
      course: bearing(a, b),
      ignition: true,
    });
    along += speedMs * STEP_S;
    t += STEP_S * 1000;
  }
  const end = r.coords.at(-1)!;
  fixes.push({ at: new Date(t), lat: end[0], lng: end[1], speedKmh: 0, course: 0, ignition: true });
  return fixes;
}

function parked(place: Place, from: Date, to: Date): Fix[] {
  const fixes: Fix[] = [];
  for (let t = from.getTime(); t < to.getTime(); t += PARKED_STEP_S * 1000) {
    fixes.push({
      at: new Date(t),
      lat: place.lat,
      lng: place.lng,
      speedKmh: 0,
      course: 0,
      ignition: false,
    });
  }
  return fixes;
}

const minutes = (n: number) => n * 60_000;
const between = (min: number, max: number) => min + Math.random() * (max - min);

// ---------------------------------------------------------------------------------------------

async function clean() {
  const devices = await traccarApi<Device[]>('GET', '/devices?all=true');
  const demo = devices.filter((d) => d.uniqueId?.startsWith(DEMO_PREFIX));
  const database = createDatabase(config.DATABASE_URL);
  try {
    const { db } = database;
    const rows = await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.notes, DEMO_NOTE));
    for (const row of rows) await deleteLocation(db, traccar, row.id);
    const demoDrivers = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.notes, DEMO_NOTE));
    const ids = demoDrivers.map((d) => d.id);
    if (ids.length) {
      await db.delete(driverAssignments).where(inArray(driverAssignments.driverId, ids));
      await db.delete(drivers).where(inArray(drivers.id, ids));
    }
    // Traccar deletes a device's positions and events with it.
    for (const d of demo) await traccarApi('DELETE', `/devices/${d.id}`);
    console.log(`Removed ${demo.length} vehicles, ${rows.length} locations, ${ids.length} drivers`);
  } finally {
    await database.pool.end();
  }
}

async function seed(live: boolean) {
  const existing = await traccarApi<Device[]>('GET', '/devices?all=true');
  if (existing.some((d) => d.uniqueId?.startsWith(DEMO_PREFIX))) {
    console.error('Demo data already exists; run with --clean first');
    process.exit(1);
  }

  const dayStart = belgradeDayRange(belgradeDay()).from;
  const now = new Date();
  const database = createDatabase(config.DATABASE_URL);
  const devices: Device[] = [];
  try {
    const { db } = database;
    for (const [i, v] of VEHICLES.entries()) {
      const device = await traccarApi<Device>('POST', '/devices', {
        name: v.name,
        uniqueId: `${DEMO_PREFIX}${i + 1}`,
        model: v.model,
        category: v.category,
      });
      devices.push(device);
      const driver = await createDriver(db, { name: v.driver, notes: DEMO_NOTE });
      // From early morning, so every trip today shows its driver.
      await assignDriver(db, device.id, driver.id, new Date(dayStart.getTime() + minutes(5 * 60)));
    }
    // After the devices, so each location is linked to all of them.
    for (const p of LOCATIONS) {
      await createLocation(db, traccar, {
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        radiusM: 150,
        notes: DEMO_NOTE,
        hourlyRate: 2500,
      });
    }
  } finally {
    await database.pool.end();
  }
  console.log(`Created ${devices.length} vehicles, ${LOCATIONS.length} locations and drivers`);

  await Promise.all(
    VEHICLES.map(async (v, i) => {
      const uniqueId = devices[i]!.uniqueId!;
      const stops = v.day.map((k) => PLACES[k]);
      let t = new Date(dayStart.getTime() + minutes(between(6.5 * 60, 8 * 60)));
      let fixes = parked(stops[0]!, new Date(dayStart.getTime() + minutes(5 * 60)), t);
      for (let s = 1; s < stops.length; s++) {
        const leg = drive(await route(stops[s - 1]!, stops[s]!), t);
        if (leg.at(-1)!.at > now) break;
        const leave = new Date(leg.at(-1)!.at.getTime() + minutes(between(35, 110)));
        fixes = [...fixes, ...leg, ...parked(stops[s]!, leg.at(-1)!.at, leave > now ? now : leave)];
        t = leave;
        if (t >= now) break;
      }
      for (const fix of fixes.filter((f) => f.at <= now)) await send(uniqueId, fix);
      console.log(`${v.name}: ${fixes.length} positions`);
    }),
  );

  if (!live) return;
  // Two vehicles keep driving between places, the rest report parked, so the map looks alive.
  console.log('Live: driving the first two vehicles; Ctrl+C stops');
  await Promise.all(
    VEHICLES.map(async (v, i) => {
      const uniqueId = devices[i]!.uniqueId!;
      const stops = v.day.map((k) => PLACES[k]);
      // Start where today's history ended and keep cycling through the day's places.
      let from: Place = stops.at(-1)!;
      for (let s = 0; ; s = (s + 1) % stops.length) {
        if (i >= 2) {
          const last = stops.at(-1)!;
          await send(uniqueId, {
            at: new Date(),
            lat: last.lat,
            lng: last.lng,
            speedKmh: 0,
            course: 0,
            ignition: false,
          });
          await sleep(30_000);
          continue;
        }
        const to = stops[s]!;
        if (to === from) continue;
        const leg = drive(await route(from, to), new Date());
        from = to;
        for (const fix of leg) {
          await send(uniqueId, { ...fix, at: new Date() });
          await sleep(STEP_S * 1000);
        }
      }
    }),
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

if (process.argv.includes('--clean')) await clean();
else await seed(process.argv.includes('--live'));
