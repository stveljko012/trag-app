// Traccar geofence areas are WKT with latitude first: "CIRCLE (lat lng, radius_m)",
// "POLYGON ((lat lng, lat lng, ...))", "LINESTRING (lat lng, ...)".

export type Shape =
  | { type: 'circle'; lat: number; lng: number; radiusM: number }
  | { type: 'polygon'; points: [number, number][] }
  | { type: 'line'; points: [number, number][] };

function parsePoints(list: string): [number, number][] | null {
  const points = list.split(',').map((pair) => pair.trim().split(/\s+/).map(Number));
  if (points.some((p) => p.length !== 2 || p.some((n) => !Number.isFinite(n)))) return null;
  return points as [number, number][];
}

/** Parses a Traccar geofence area; returns null for shapes we don't draw. */
export function parseArea(area: string): Shape | null {
  const text = area.trim();
  let m = /^CIRCLE\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*,\s*([\d.]+)\s*\)$/i.exec(text);
  if (m) {
    const [lat, lng, radiusM] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return [lat, lng, radiusM].every(Number.isFinite)
      ? { type: 'circle', lat, lng, radiusM }
      : null;
  }
  m = /^POLYGON\s*\(\s*\(([^()]*)\)\s*\)$/i.exec(text);
  if (m) {
    const points = parsePoints(m[1]!);
    return points && points.length >= 3 ? { type: 'polygon', points } : null;
  }
  m = /^LINESTRING\s*\(([^()]*)\)$/i.exec(text);
  if (m) {
    const points = parsePoints(m[1]!);
    return points && points.length >= 2 ? { type: 'line', points } : null;
  }
  return null;
}

/** WKT for a Traccar circle geofence. Latitude first, space separated, radius in meters. */
export function circleWkt(lat: number, lng: number, radiusM: number): string {
  if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) {
    throw new RangeError(`Invalid coordinates: ${lat}, ${lng}`);
  }
  if (!(radiusM > 0)) throw new RangeError(`Invalid radius: ${radiusM}`);
  // 6 decimals is ~0.1 m; more only adds noise.
  return `CIRCLE (${+lat.toFixed(6)} ${+lng.toFixed(6)}, ${+radiusM.toFixed(1)})`;
}
