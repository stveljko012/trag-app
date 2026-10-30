import L from 'leaflet';
import { type ComponentProps, useEffect, useRef, useState } from 'react';
import { Marker } from 'react-leaflet';

/** How long a marker glides to its new position. Also used to pan the map in follow mode. */
export const MOVE_MS = 1000;
// Bigger jumps (a vehicle back online after a gap) are teleported, not animated.
const MAX_ANIMATED_M = 2000;

/**
 * Marker that glides to a new position instead of jumping.
 * Leaflet owns the position after mount: react-leaflet would otherwise call setLatLng on every
 * prop change and fight the animation.
 */
export function AnimatedMarker({
  position,
  ...props
}: Omit<ComponentProps<typeof Marker>, 'position'> & { position: [number, number] }) {
  const ref = useRef<L.Marker>(null);
  const [initial] = useState(position);
  const [lat, lng] = position;

  useEffect(() => {
    const marker = ref.current;
    if (!marker) return;
    const from = marker.getLatLng();
    const to = L.latLng(lat, lng);
    if (from.equals(to)) return;
    if (
      document.hidden ||
      from.distanceTo(to) > MAX_ANIMATED_M ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      marker.setLatLng(to);
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function step(t) {
      const k = Math.min(1, (t - start) / MOVE_MS);
      const e = 1 - (1 - k) ** 3; // ease-out
      marker.setLatLng([from.lat + (to.lat - from.lat) * e, from.lng + (to.lng - from.lng) * e]);
      if (k < 1) frame = requestAnimationFrame(step);
    });
    // A newer position starts from wherever this animation stopped.
    return () => cancelAnimationFrame(frame);
  }, [lat, lng]);

  return <Marker ref={ref} position={initial} {...props} />;
}
