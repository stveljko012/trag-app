// All Traccar unit conversions live here. Traccar reports speed in knots, distance in meters,
// durations in milliseconds and timestamps as ISO 8601 UTC strings.

export const KMH_PER_KNOT = 1.852;

export function knotsToKmh(knots: number): number {
  return knots * KMH_PER_KNOT;
}

export function metersToKm(meters: number): number {
  return meters / 1000;
}

export function msToSeconds(ms: number): number {
  return Math.round(ms / 1000);
}

export function round(value: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
