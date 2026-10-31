import type { Map as LeafletMap } from 'leaflet';
import {
  Focus,
  Map as MapIcon,
  Maximize,
  MessageSquare,
  Minimize,
  Minus,
  Plus,
  Satellite,
  ScanSearch,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, Polyline } from 'react-leaflet';
import { Link } from 'react-router';
import { useLocations, useRoute, useVehicles } from '../api/queries';
import { useMe } from '../auth/useAuth';
import { VehicleDetails } from '../components/fleet/VehicleDetails';
import { VehicleList } from '../components/fleet/VehicleList';
import { AnimatedMarker, MOVE_MS } from '../components/map/AnimatedMarker';
import { BaseMap, type Basemap, MapClick } from '../components/map/BaseMap';
import { vehicleIcon } from '../components/map/icons';
import { LocationsLayer } from '../components/map/LocationsLayer';
import { Missing } from '../components/Missing';
import { Dot } from '../components/ui';
import { type Filter, filterVehicles } from '../lib/fleetFilter';
import { buttonClass, cn, themeColor } from '../lib/ui';
import { useNow } from '../lib/useNow';
import { belgradeDay } from '../lib/time';
import { displayState, STATE_LABEL } from '../lib/vehicleState';
import { PageTitle } from '../components/PageTitle';

const REFRESH_MS = 10_000;
// The viewer's last base map choice; only a convenience, so storage errors are ignored.
const BASEMAP_KEY = 'trag.map.basemap';

function readBasemap(): Basemap {
  try {
    return localStorage.getItem(BASEMAP_KEY) === 'satellite' ? 'satellite' : 'map';
  } catch {
    return 'map';
  }
}
// "Ask the map" bar is hidden until the AI assistant (Phase 5) exists.
const SHOW_ASK = false;
const ASK_EXAMPLES = [
  'Ko je najbliži klijentu Marković gradnja?',
  'Koja vozila su trenutno u Beogradu?',
  'Gde je bio Sprinter u 11h?',
];

export function MapPage() {
  const { data: me } = useMe();
  const vehicles = useVehicles({ refetchInterval: REFRESH_MS });
  const locations = useLocations();
  const now = useNow(1000);
  const primary = themeColor('--color-primary');

  const [map, setMap] = useState<LeafletMap | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [basemap, setBasemap] = useState<Basemap>(readBasemap);

  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [following, setFollowing] = useState(false);
  const [routeIndex, setRouteIndex] = useState<number | null>(null);
  const [layers, setLayers] = useState({ locations: true, route: true, speed: true });

  const all = useMemo(() => vehicles.data ?? [], [vehicles.data]);
  const visible = useMemo(() => filterVehicles(all, filter, query), [all, filter, query]);
  const selected = all.find((v) => v.id === selectedId) ?? null;

  const route = useRoute(layers.route ? (selectedId ?? undefined) : undefined, belgradeDay(), {
    refetchInterval: 30_000,
  });
  // The route refetches every 30 s but positions every 10 s, so the line would lag behind the
  // marker. Extend it with the live position until the next refetch brings the real points.
  const livePos = selected?.position;
  const routePoints = useMemo(() => {
    const points = layers.route ? (route.data ?? []) : [];
    const lastTime = points.at(-1)?.time;
    if (
      !livePos ||
      !lastTime ||
      livePos.fixTime <= lastTime ||
      belgradeDay(new Date(livePos.fixTime)) !== belgradeDay()
    ) {
      return points;
    }
    const { lat, lng, speedKmh, fixTime: time } = livePos;
    return [...points, { time, lat, lng, speedKmh }];
  }, [layers.route, route.data, livePos]);
  const scrubbed = routeIndex !== null ? routePoints[routeIndex] : undefined;

  /** Selecting the already selected vehicle deselects it. */
  function select(id: number | null) {
    setSelectedId((current) => (id === current ? null : id));
    setRouteIndex(null);
    setFollowing(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function fitAll() {
    const points = all.flatMap((v) =>
      v.position ? [[v.position.lat, v.position.lng] as [number, number]] : [],
    );
    if (map && points.length) map.fitBounds(points, { padding: [80, 80], maxZoom: 14 });
  }

  // Fit to the fleet once, when both the map and the first data are there.
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || !map || !vehicles.isSuccess) return;
    fitted.current = true;
    fitAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time initial fit
  }, [map, vehicles.isSuccess]);

  // Center on a vehicle when it is selected, and keep it centered while following.
  const selectedPos = selected?.position
    ? ([selected.position.lat, selected.position.lng] as [number, number])
    : null;
  useEffect(() => {
    if (map && selectedPos)
      map.setView(selectedPos, Math.max(map.getZoom(), 13), { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on selection change
  }, [map, selectedId]);
  useEffect(() => {
    if (map && following && selectedPos)
      map.panTo(selectedPos, { animate: true, duration: MOVE_MS / 1000 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follow position updates
  }, [map, following, selectedPos?.[0], selectedPos?.[1]]);

  // Dragging the map by hand ends follow mode (programmatic pans don't fire dragstart).
  useEffect(() => {
    if (!map) return;
    const stopFollowing = () => setFollowing(false);
    map.on('dragstart', stopFollowing);
    return () => {
      map.off('dragstart', stopFollowing);
    };
  }, [map]);

  useEffect(() => {
    const onChange = () => {
      setFullscreen(document.fullscreenElement === wrapRef.current);
      setTimeout(() => map?.invalidateSize(), 50);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [map]);

  function toggleBasemap() {
    const next = basemap === 'map' ? 'satellite' : 'map';
    setBasemap(next);
    try {
      localStorage.setItem(BASEMAP_KEY, next);
    } catch {
      // Private mode: the choice just is not remembered.
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapRef.current?.requestFullscreen();
  }

  const floatPanel = 'bg-surface shadow-float';
  const controlButton =
    'grid size-11 place-items-center text-text hover:bg-surface-muted [&+&]:border-t [&+&]:border-border';

  return (
    <div className="grid h-[calc(100dvh-var(--footer-height))] min-h-[560px] grid-cols-[340px_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] max-md:flex max-md:h-auto max-md:min-h-0 max-md:flex-col">
      {/* Phones: hidden, the map needs the height more than the title. */}
      <header className="col-span-full flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-surface px-5 py-3.5 max-md:hidden">
        <PageTitle>
          <h1 className="text-[1.4rem] font-extrabold tracking-[-0.01em]">Mapa uživo</h1>
        </PageTitle>
        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          {me?.role === 'owner' && (
            <Link
              className={buttonClass()}
              to={
                map
                  ? `/locations?new=1&lat=${map.getCenter().lat}&lng=${map.getCenter().lng}`
                  : '/locations?new=1'
              }
            >
              <ScanSearch size={16} />
              Nova lokacija
            </Link>
          )}
        </div>
      </header>

      <VehicleList
        vehicles={all}
        visible={visible}
        filter={filter}
        onFilter={setFilter}
        query={query}
        onQuery={setQuery}
        selectedId={selectedId}
        onSelect={select}
      />

      <div
        ref={wrapRef}
        className="relative min-h-0 bg-[#e8ecef] fullscreen:h-screen fullscreen:w-screen max-md:h-[calc(100dvh-var(--topbar-height)-60px)] max-md:min-h-[480px] max-md:shrink-0"
      >
        <BaseMap className="absolute inset-0" zoomControl={false} basemap={basemap} onMap={setMap}>
          <MapClick onClick={() => select(null)} />
          {layers.locations && locations.data && <LocationsLayer locations={locations.data} />}
          {routePoints.length > 1 && (
            <Polyline
              positions={routePoints.map((p) => [p.lat, p.lng] as [number, number])}
              pathOptions={{ color: primary, weight: 4, opacity: 0.85 }}
            />
          )}
          {scrubbed && (
            <CircleMarker
              center={[scrubbed.lat, scrubbed.lng]}
              radius={8}
              pathOptions={{ color: '#fff', weight: 3, fillColor: primary, fillOpacity: 1 }}
            />
          )}
          {visible.map((v) => {
            if (!v.position) return null;
            const state = displayState(v);
            const speed =
              layers.speed && state === 'moving'
                ? `${Math.round(v.position.speedKmh)} km/h`
                : undefined;
            return (
              <AnimatedMarker
                key={v.id}
                position={[v.position.lat, v.position.lng]}
                icon={vehicleIcon(v.name, state, v.id === selectedId, speed, v.position.ignition)}
                zIndexOffset={v.id === selectedId ? 1000 : state === 'alarm' ? 500 : 0}
                eventHandlers={{ click: () => select(v.id) }}
              />
            );
          })}
        </BaseMap>

        {SHOW_ASK && (
          <div className="pointer-events-none absolute top-4 right-[76px] left-4 z-800 flex max-w-[780px] flex-col gap-2 max-md:top-3 max-md:right-[68px] max-md:left-3 [&>*]:pointer-events-auto">
            <Missing>
              <div className={cn(floatPanel, 'flex items-center gap-2.5 rounded-[14px] p-1.5')}>
                <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-primary text-white">
                  <MessageSquare size={20} />
                </span>
                <input
                  className="min-w-0 flex-1 bg-transparent text-[0.95rem] outline-none"
                  placeholder="Pitajte mapu… npr. Ko je najbliži klijentu Marković gradnja?"
                />
                <button
                  type="button"
                  className="h-10 rounded-[10px] bg-dark px-4 font-semibold text-white"
                >
                  Pitaj
                </button>
              </div>
            </Missing>
            <Missing className="max-w-full self-start">
              <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
                {ASK_EXAMPLES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="h-8 shrink-0 whitespace-nowrap rounded-full border border-border bg-surface px-3 text-[0.85rem] max-md:text-[0.8rem]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </Missing>
          </div>
        )}

        <div className="absolute top-4 right-4 z-800 flex flex-col gap-2.5 max-md:top-3 max-md:right-3">
          <div className={cn(floatPanel, 'flex flex-col overflow-hidden rounded-[10px]')}>
            <button
              type="button"
              className={controlButton}
              aria-label="Uvećaj"
              onClick={() => map?.zoomIn()}
            >
              <Plus size={20} />
            </button>
            <button
              type="button"
              className={controlButton}
              aria-label="Umanji"
              onClick={() => map?.zoomOut()}
            >
              <Minus size={20} />
            </button>
          </div>
          <div className={cn(floatPanel, 'overflow-hidden rounded-[10px]')}>
            <button
              type="button"
              className={controlButton}
              aria-label={basemap === 'map' ? 'Satelitski prikaz' : 'Prikaz mape'}
              title={basemap === 'map' ? 'Satelitski prikaz' : 'Prikaz mape'}
              onClick={toggleBasemap}
            >
              {basemap === 'map' ? <Satellite size={19} /> : <MapIcon size={19} />}
            </button>
          </div>
          {/* Phones: hidden, iPhone Safari has no element fullscreen and the map fills the screen anyway. */}
          <div className={cn(floatPanel, 'overflow-hidden rounded-[10px] max-md:hidden')}>
            <button
              type="button"
              className={controlButton}
              aria-label={fullscreen ? 'Izađi iz celog ekrana' : 'Ceo ekran'}
              onClick={toggleFullscreen}
            >
              {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
          <div className={cn(floatPanel, 'overflow-hidden rounded-[10px]')}>
            <button
              type="button"
              className={controlButton}
              aria-label="Prikaži sva vozila"
              onClick={fitAll}
            >
              <Focus size={20} />
            </button>
          </div>
        </div>

        <div
          className={cn(
            floatPanel,
            'absolute bottom-4 left-4 z-800 flex gap-1.5 rounded-xl p-1.5 max-md:bottom-3 max-md:left-3',
          )}
        >
          {(
            [
              ['locations', 'Lokacije'],
              ['route', 'Ruta'],
              ['speed', 'Brzina'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={layers[key]}
              onClick={() => setLayers((l) => ({ ...l, [key]: !l[key] }))}
              className="h-9 rounded-lg px-3.5 font-semibold text-muted aria-pressed:bg-primary-soft aria-pressed:text-primary max-md:px-2.5"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="absolute right-4 bottom-6 z-800 flex flex-wrap gap-x-3.5 gap-y-1.5 rounded-[10px] bg-white/95 px-3.5 py-2 text-[0.85rem] shadow-card max-md:hidden">
          {(['moving', 'stopped', 'alarm', 'offline'] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <Dot state={s} /> {STATE_LABEL[s]}
            </span>
          ))}
        </div>

        {(vehicles.isPending || vehicles.isError) && (
          <div className="absolute top-1/2 left-1/2 z-800 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface px-3.5 py-2 text-sm shadow-card">
            {vehicles.isError ? `Greška: ${vehicles.error.message}` : 'Učitavanje vozila…'}
          </div>
        )}

        {selected && (
          <div
            className={cn(
              'pointer-events-none absolute bottom-4 left-4 z-900 flex w-[380px] flex-col max-md:fixed max-md:top-auto max-md:right-0 max-md:bottom-0 max-md:left-0 max-md:z-1200 max-md:max-h-[78dvh] max-md:w-auto [&>*]:pointer-events-auto [&>*]:max-h-full',
              // Below the ask bar when it is shown, otherwise at the top like the map controls.
              SHOW_ASK ? 'top-[132px]' : 'top-4',
            )}
          >
            <VehicleDetails
              key={selected.id}
              vehicle={selected}
              now={now}
              route={routePoints}
              routeIndex={routeIndex}
              onRouteIndex={setRouteIndex}
              following={following}
              onFollow={setFollowing}
              onClose={() => select(null)}
              className="max-md:rounded-b-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}
