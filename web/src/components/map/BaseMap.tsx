import type { LatLngBoundsExpression, Map as LeafletMap } from 'leaflet';
import { type ReactNode, useEffect } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';

const BELGRADE: [number, number] = [44.8125, 20.4612];

export type Basemap = 'map' | 'satellite';

// Esri imagery needs no key; its native zoom stops at 18 in most of Serbia, so 19 upscales.
const TILES: Record<Basemap, { url: string; attribution: string; maxNativeZoom: number }> = {
  map: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxNativeZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics',
    maxNativeZoom: 18,
  },
};

export function BaseMap({
  children,
  className,
  zoomControl = true,
  basemap = 'map',
  onMap,
}: {
  children?: ReactNode;
  className?: string;
  zoomControl?: boolean;
  basemap?: Basemap;
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
      {/* Keyed so a switch builds a new layer: attribution and zoom limits are not mutable. */}
      <TileLayer
        key={basemap}
        {...TILES[basemap]}
        maxZoom={19}
        className={basemap === 'map' ? 'trag-tiles-neutral' : undefined}
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
