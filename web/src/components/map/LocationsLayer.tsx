import type { PathOptions } from 'leaflet';
import { Circle, Polygon, Polyline, Tooltip } from 'react-leaflet';
import type { Location } from '../../api/types';

const STYLE: PathOptions = {
  color: '#16a34a',
  weight: 2,
  dashArray: '6 6',
  fillColor: '#16a34a',
  fillOpacity: 0.1,
};
const SELECTED_STYLE: PathOptions = { ...STYLE, weight: 3, fillOpacity: 0.2 };

export function LocationsLayer({
  locations,
  selectedId,
  onSelect,
}: {
  locations: Location[];
  selectedId?: number | null;
  onSelect?: (id: number) => void;
}) {
  return locations.map(({ id, name, shape }) => {
    if (!shape) return null;
    const pathOptions = id === selectedId ? SELECTED_STYLE : STYLE;
    const eventHandlers = onSelect ? { click: () => onSelect(id) } : undefined;
    const label = (
      <Tooltip permanent direction="bottom" offset={[0, 6]} className="trag-location-label">
        {name}
      </Tooltip>
    );
    if (shape.type === 'circle') {
      return (
        <Circle
          key={id}
          center={[shape.lat, shape.lng]}
          radius={shape.radiusM}
          pathOptions={pathOptions}
          eventHandlers={eventHandlers}
        >
          {label}
        </Circle>
      );
    }
    if (shape.type === 'polygon') {
      return (
        <Polygon
          key={id}
          positions={shape.points}
          pathOptions={pathOptions}
          eventHandlers={eventHandlers}
        >
          {label}
        </Polygon>
      );
    }
    return (
      <Polyline
        key={id}
        positions={shape.points}
        pathOptions={pathOptions}
        eventHandlers={eventHandlers}
      >
        {label}
      </Polyline>
    );
  });
}
