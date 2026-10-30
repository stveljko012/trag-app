import { describe, expect, it } from 'vitest';
import { knotsToKmh, metersToKm, msToSeconds, round } from '../src/traccar/units.js';

describe('Traccar unit conversions', () => {
  it('converts knots to km/h', () => {
    expect(knotsToKmh(0)).toBe(0);
    expect(knotsToKmh(1)).toBe(1.852);
    expect(round(knotsToKmh(54))).toBe(100);
  });

  it('converts meters to km', () => {
    expect(metersToKm(12_345)).toBe(12.345);
  });

  it('converts ms to whole seconds', () => {
    expect(msToSeconds(90_400)).toBe(90);
    expect(msToSeconds(90_600)).toBe(91);
  });

  it('rounds to the given digits', () => {
    expect(round(1.2345, 2)).toBe(1.23);
    expect(round(64.06)).toBe(64.1);
  });
});
