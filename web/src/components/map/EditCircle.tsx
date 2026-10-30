import L from 'leaflet';
import { Circle, Marker } from 'react-leaflet';
import { themeColor } from '../../lib/ui';

const handleIcon = L.divIcon({
  className: 'trag-edit-handle',
  html: '<div class="trag-edit-handle-dot"></div>',
  iconSize: [0, 0],
});

/** Circle being edited: blue preview plus a draggable center handle. */
export function EditCircle({
  lat,
  lng,
  radiusM,
  onMove,
}: {
  lat: number;
  lng: number;
  radiusM: number;
  onMove?: (lat: number, lng: number) => void;
}) {
  const primary = themeColor('--color-primary');
  return (
    <>
      <Circle
        center={[lat, lng]}
        radius={radiusM}
        interactive={false}
        pathOptions={{ color: primary, weight: 2, fillColor: primary, fillOpacity: 0.15 }}
      />
      <Marker
        position={[lat, lng]}
        icon={handleIcon}
        draggable={!!onMove}
        zIndexOffset={2000}
        eventHandlers={{
          drag: (e) => {
            const p = (e.target as L.Marker).getLatLng();
            onMove?.(p.lat, p.lng);
          },
        }}
      />
    </>
  );
}
