import type { LatLngBoundsExpression, Map as LeafletMap } from 'leaflet';
import { type ReactNode, useEffect } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';

const BELGRADE: [number, number] = [44.8125, 20.4612];

export function BaseMap({
  children,
  className,
  zoomControl = true,
  onMap,
}: {
  children?: ReactNode;
  className?: string;
  zoomControl?: boolean;
  /** Receives the Leaflet map, for controls rendered outside the map. */
  onMap?: (map: LeafletMap | null) => void;
}) {
  return (
    <MapContainer
      center={BELGRADE}
      zoom={8}
      className={className}
      zoomControl={zoomControl}
      ref={onMap}
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
      />
      {children}
    </MapContainer>
  );
}

/** Fits the map to `bounds` whenever `fitKey` changes (not on every bounds update). */
export function FitBounds({
  bounds,
  fitKey,
}: {
  bounds: LatLngBoundsExpression | null;
  fitKey: string;
}) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refit only when the key changes
  }, [map, fitKey]);
  return null;
}

/** Pans to `center` whenever `panKey` changes. */
export function PanTo({ center, panKey }: { center: [number, number] | null; panKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, Math.max(map.getZoom(), 14), { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pan only when the key changes
  }, [map, panKey]);
  return null;
}

/** Leaflet needs a nudge when its container changes size (e.g. a side panel opens). */
export function InvalidateSize({ dep }: { dep: unknown }) {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 0);
    return () => clearTimeout(t);
  }, [map, dep]);
  return null;
}

/** Calls `onClick` for clicks on the map itself (not on markers or shapes). */
export function MapClick({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}
