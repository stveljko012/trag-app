import { describe, expect, it } from 'vitest';
import { circleWkt, parseArea } from '../src/traccar/wkt.js';

describe('parseArea', () => {
  it('parses circles with latitude first', () => {
    expect(parseArea('CIRCLE (44.8125 20.4612, 150)')).toEqual({
      type: 'circle',
      lat: 44.8125,
      lng: 20.4612,
      radiusM: 150,
    });
    expect(parseArea('circle(45.048 20.081,600.5)')).toMatchObject({ radiusM: 600.5 });
  });

  it('parses polygons and lines', () => {
    expect(parseArea('POLYGON ((44.1 20.1, 44.2 20.1, 44.2 20.2, 44.1 20.1))')).toEqual({
      type: 'polygon',
      points: [
        [44.1, 20.1],
        [44.2, 20.1],
        [44.2, 20.2],
        [44.1, 20.1],
      ],
    });
    expect(parseArea('LINESTRING (44.1 20.1, 44.2 20.2)')).toMatchObject({ type: 'line' });
  });

  it('returns null for anything else', () => {
    expect(parseArea('POINT (44 20)')).toBeNull();
    expect(parseArea('CIRCLE (abc 20, 10)')).toBeNull();
    expect(parseArea('POLYGON ((44 20, 45 21))')).toBeNull();
  });
});

describe('circleWkt', () => {
  it('writes latitude first, space separated, then the radius', () => {
    expect(circleWkt(44.8125, 20.4612, 150)).toBe('CIRCLE (44.8125 20.4612, 150)');
  });

  it('trims float noise and round-trips through parseArea', () => {
    const wkt = circleWkt(44.81250000001, 20.46119999999, 99.99);
    expect(wkt).toBe('CIRCLE (44.8125 20.4612, 100)');
    expect(parseArea(wkt)).toEqual({ type: 'circle', lat: 44.8125, lng: 20.4612, radiusM: 100 });
  });

  it('rejects impossible values', () => {
    expect(() => circleWkt(91, 20, 100)).toThrow(RangeError);
    expect(() => circleWkt(44, 181, 100)).toThrow(RangeError);
    expect(() => circleWkt(44, 20, 0)).toThrow(RangeError);
  });
});
