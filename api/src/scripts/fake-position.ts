// Local stand-in for Traccar's position forwarding: drives one real device (name and start from
// Traccar) in a straight line and posts each step to the webhook, like Traccar does.
// Usage: npm run -w @trag/api fake:position -- [deviceId]
import { loadConfig } from '../config.js';
import { TraccarClient } from '../traccar/traccar.js';

const STEP_MS = 3000;
const SPEED_KMH = 40;
const COURSE = 45;
const BELGRADE = { latitude: 44.8125, longitude: 20.4612 };

const config = loadConfig();
if (!config.WEBHOOK_SECRET) {
  console.error('WEBHOOK_SECRET must be set (the API needs the same one)');
  process.exit(1);
}
const traccar = new TraccarClient({
  url: config.TRACCAR_URL,
  token: config.TRACCAR_TOKEN,
  user: config.TRACCAR_USER,
  pass: config.TRACCAR_PASS,
});

const devices = (await traccar.getDevices()).filter((d) => !d.disabled);
const wanted = process.argv[2] ? Number(process.argv[2]) : devices[0]?.id;
const device = devices.find((d) => d.id === wanted);
if (!device) {
  console.error(`Device ${wanted ?? ''} not found; known: ${devices.map((d) => d.id).join(', ')}`);
  process.exit(1);
}
const latest = (await traccar.getLatestPositions()).find((p) => p.deviceId === device.id);
let { latitude, longitude } = latest ?? BELGRADE;

const url = `http://localhost:${config.PORT}/api/webhooks/traccar/position`;
const stepM = (SPEED_KMH / 3.6) * (STEP_MS / 1000);
console.log(
  `Driving ${device.name} (${device.id}) every ${STEP_MS / 1000} s to ${url}; Ctrl+C stops`,
);

for (;;) {
  // Equal north and east steps for a 45° course.
  const d = stepM / Math.SQRT2;
  latitude += d / 111_320;
  longitude += d / (111_320 * Math.cos((latitude * Math.PI) / 180));
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': config.WEBHOOK_SECRET },
    body: JSON.stringify({
      device: { ...device, status: 'online', lastUpdate: new Date().toISOString() },
      position: {
        ...latest,
        id: Date.now(),
        deviceId: device.id,
        latitude,
        longitude,
        speed: SPEED_KMH / 1.852,
        course: COURSE,
        fixTime: new Date().toISOString(),
        address: null,
        attributes: { ...latest?.attributes, ignition: true, alarm: undefined },
      },
    }),
  }).catch((err: unknown) => err as Error);
  console.log(
    res instanceof Error
      ? `failed: ${res.message}`
      : `${res.status} ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
  );
  await new Promise((resolve) => setTimeout(resolve, STEP_MS));
}
