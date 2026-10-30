import { ChevronLeft, ChevronRight, Loader2, MapPinPlus, RotateCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Marker, Polyline, Popup } from 'react-leaflet';
import { Link, useSearchParams } from 'react-router';
import { useRoute, useStops, useTrips, useVehicles } from '../api/queries';
import { useMe } from '../auth/useAuth';
import type { Stop, Trip } from '../api/types';
import { BaseMap, FitBounds, PanTo } from '../components/map/BaseMap';
import { stopIcon } from '../components/map/icons';
import { Select } from '../components/Select';
import {
  addDays,
  belgradeDay,
  formatDuration,
  formatKm,
  formatLongDay,
  formatTime,
} from '../lib/time';
import { EmptyState, ErrorMessage, Skeleton, Stat } from '../components/ui';
import { buttonClass, cn, inputClass, themeColor } from '../lib/ui';

type Entry =
  { kind: 'trip'; trip: Trip; index: number } | { kind: 'stop'; stop: Stop; index: number };
type Selection = { kind: 'trip' | 'stop'; index: number } | null;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const { data: me } = useMe();
  const vehicles = useVehicles();
  const today = belgradeDay();

  const dayParam = params.get('day');
  const day = dayParam && DAY_RE.test(dayParam) && dayParam <= today ? dayParam : today;
  const vehicleParam = Number(params.get('vehicle'));
  const vehicleId = vehicles.data?.some((v) => v.id === vehicleParam)
    ? vehicleParam
    : vehicles.data?.[0]?.id;

  const route = useRoute(vehicleId, day);
  const trips = useTrips(vehicleId, day);
  const stops = useStops(vehicleId, day);
  const [selection, setSelection] = useState<Selection>(null);

  function update(next: { vehicle?: number; day?: string }) {
    setSelection(null);
    setParams(
      { vehicle: String(next.vehicle ?? vehicleId ?? ''), day: next.day ?? day },
      { replace: true },
    );
  }

  const points = useMemo(() => route.data ?? [], [route.data]);
  const line = useMemo(() => points.map((p) => [p.lat, p.lng] as [number, number]), [points]);
  const stopList = useMemo(
    () => (stops.data ?? []).filter((s) => s.lat !== null && s.lng !== null),
    [stops.data],
  );
  const tripList = useMemo(() => trips.data ?? [], [trips.data]);

  const entries = useMemo<Entry[]>(
    () =>
      [
        ...tripList.map((trip, index) => ({ kind: 'trip' as const, trip, index })),
        ...stopList.map((stop, index) => ({ kind: 'stop' as const, stop, index })),
      ].sort((a, b) =>
        (a.kind === 'trip' ? a.trip.startTime : a.stop.startTime).localeCompare(
          b.kind === 'trip' ? b.trip.startTime : b.stop.startTime,
        ),
      ),
    [tripList, stopList],
  );

  const selectedTrip = selection?.kind === 'trip' ? tripList[selection.index] : undefined;
  const selectedStop = selection?.kind === 'stop' ? stopList[selection.index] : undefined;

  const tripLine = useMemo(() => {
    if (!selectedTrip) return null;
    return points
      .filter((p) => p.time >= selectedTrip.startTime && p.time <= selectedTrip.endTime)
      .map((p) => [p.lat, p.lng] as [number, number]);
  }, [points, selectedTrip]);

  const totals = useMemo(
    () => ({
      km: tripList.reduce((sum, t) => sum + t.distanceKm, 0),
      drivingS: tripList.reduce((sum, t) => sum + t.durationS, 0),
    }),
    [tripList],
  );

  // Report queries are disabled (and so "pending") until a vehicle is known.
  const noVehicles = vehicles.isSuccess && vehicles.data.length === 0;
  const waitingForVehicle = vehicleId === undefined && vehicles.isPending;
  const routeLoading = waitingForVehicle || (vehicleId !== undefined && route.isPending);
  const panelLoading =
    waitingForVehicle || (vehicleId !== undefined && (trips.isPending || stops.isPending));
  const loading = routeLoading || panelLoading;
  const error = vehicles.error ?? route.error ?? trips.error ?? stops.error;

  function retry() {
    void vehicles.refetch();
    void route.refetch();
    void trips.refetch();
    void stops.refetch();
  }

  return (
    <div className="grid h-[calc(100dvh-var(--footer-height))] min-h-[520px] grid-cols-[minmax(0,1fr)_380px] grid-rows-[auto_minmax(0,1fr)] max-md:flex max-md:h-auto max-md:min-h-0 max-md:flex-col">
      <div className="col-span-full flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-3">
        <h1 className="mr-auto text-xl font-bold max-md:w-full">Istorija</h1>
        <Select
          ariaLabel="Vozilo"
          placeholder="Vozilo"
          mono
          value={vehicleId !== undefined ? String(vehicleId) : undefined}
          onValueChange={(id) => update({ vehicle: Number(id) })}
          options={(vehicles.data ?? []).map((v) => ({ value: String(v.id), label: v.name }))}
          disabled={!vehicles.data?.length}
        />
        <div className="flex gap-1">
          <button
            type="button"
            className={buttonClass({ icon: true })}
            aria-label="Prethodni dan"
            onClick={() => update({ day: addDays(day, -1) })}
          >
            <ChevronLeft size={18} />
          </button>
          <input
            className={inputClass}
            type="date"
            aria-label="Dan"
            value={day}
            max={today}
            onChange={(e) => e.target.value && update({ day: e.target.value })}
          />
          <button
            type="button"
            className={buttonClass({ icon: true })}
            aria-label="Sledeći dan"
            disabled={day >= today}
            onClick={() => update({ day: addDays(day, 1) })}
          >
            <ChevronRight size={18} />
          </button>
          <button
            type="button"
            className={buttonClass()}
            disabled={day === today}
            onClick={() => update({ day: today })}
          >
            Danas
          </button>
        </div>
      </div>

      <div className="relative min-h-0 max-md:h-[50dvh] max-md:shrink-0">
        <BaseMap className="absolute inset-0">
          <FitBounds
            bounds={line.length ? line : null}
            fitKey={`${vehicleId}-${day}-${route.isSuccess}`}
          />
          <FitBounds
            bounds={tripLine?.length ? tripLine : null}
            fitKey={selectedTrip ? `trip-${selectedTrip.startTime}` : 'none'}
          />
          <PanTo
            center={selectedStop ? [selectedStop.lat!, selectedStop.lng!] : null}
            panKey={selectedStop ? `stop-${selectedStop.startTime}` : 'none'}
          />
          {line.length > 1 && (
            <Polyline
              positions={line}
              pathOptions={{ color: themeColor('--color-primary'), weight: 4, opacity: 0.55 }}
            />
          )}
          {tripLine && tripLine.length > 1 && (
            <Polyline
              positions={tripLine}
              pathOptions={{ color: '#0f172a', weight: 6, opacity: 0.9 }}
            />
          )}
          {stopList.map((s, i) => (
            <Marker
              key={s.startTime}
              position={[s.lat!, s.lng!]}
              icon={stopIcon(String(i + 1), selectedStop === s)}
              eventHandlers={{ click: () => setSelection({ kind: 'stop', index: i }) }}
            />
          ))}
          {selectedStop && selection && (
            <Popup
              position={[selectedStop.lat!, selectedStop.lng!]}
              offset={[0, -8]}
              eventHandlers={{
                // Closing the popup deselects the stop, but not when it closed because
                // something else got selected.
                remove: () =>
                  setSelection((cur) =>
                    cur?.kind === 'stop' && cur.index === selection.index ? null : cur,
                  ),
              }}
            >
              <StopPopup
                stop={selectedStop}
                number={stopList.indexOf(selectedStop) + 1}
                canCreate={me?.role === 'owner'}
              />
            </Popup>
          )}
        </BaseMap>
        {routeLoading && (
          <div className={mapNotice}>
            <Loader2 size={16} className="animate-spin text-primary" /> Učitavanje rute…
          </div>
        )}
        {!routeLoading && !error && !noVehicles && points.length === 0 && (
          <div className={mapNotice}>Nema podataka o kretanju za ovaj dan.</div>
        )}
      </div>

      <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-l border-border bg-surface p-4 max-md:overflow-visible max-md:border-l-0">
        <div className="font-semibold">{formatLongDay(day)}</div>
        {error && (
          <ErrorMessage className="flex items-center justify-between gap-3">
            <span>{error.message}</span>
            <button type="button" className={cn(buttonClass(), 'shrink-0')} onClick={retry}>
              <RotateCw size={15} /> Pokušaj ponovo
            </button>
          </ErrorMessage>
        )}
        {noVehicles && <EmptyState>Nema vozila.</EmptyState>}

        <div className="grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-2">
          {(
            [
              ['Pređeno', formatKm(totals.km)],
              ['Vožnje', tripList.length],
              ['U vožnji', formatDuration(totals.drivingS)],
              ['Stajanja', stopList.length],
            ] as const
          ).map(([label, value]) => (
            <Stat
              key={label}
              label={label}
              value={panelLoading ? <Skeleton className="mt-1 mb-0.5 h-5 w-16" /> : value}
            />
          ))}
        </div>

        <ol className="flex flex-col">
          {entries.map((e) => {
            const isSelected = selection?.kind === e.kind && selection.index === e.index;
            return (
              <li key={`${e.kind}-${e.index}`}>
                <button
                  type="button"
                  className={cn(
                    'grid w-full grid-cols-[28px_1fr] gap-x-2.5 gap-y-0.5 rounded-lg px-2 py-2.5 text-left hover:bg-surface-muted',
                    isSelected && 'bg-primary-soft hover:bg-primary-soft',
                  )}
                  onClick={() => setSelection(isSelected ? null : { kind: e.kind, index: e.index })}
                >
                  {e.kind === 'trip' ? (
                    <TripEntry trip={e.trip} />
                  ) : (
                    <StopEntry stop={e.stop} number={e.index + 1} />
                  )}
                </button>
              </li>
            );
          })}
          {panelLoading &&
            [0, 1, 2, 3, 4].map((i) => (
              <li
                key={i}
                aria-hidden
                className="grid grid-cols-[28px_1fr] gap-x-2.5 gap-y-1.5 px-2 py-2.5"
              >
                <Skeleton className="row-span-2 size-7 rounded-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </li>
            ))}
          {!loading && !error && !noVehicles && entries.length === 0 && (
            <li>
              <EmptyState>Nema vožnji ni stajanja.</EmptyState>
            </li>
          )}
        </ol>
      </aside>
    </div>
  );
}

const mapNotice =
  'absolute top-4 left-1/2 z-500 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-surface px-3.5 py-2 text-sm shadow-card';

const entryIcon =
  'row-span-2 grid size-7 place-items-center rounded-full text-xs font-bold text-white';

function TripEntry({ trip }: { trip: Trip }) {
  return (
    <>
      <span className={cn(entryIcon, 'bg-primary')}>V</span>
      <span className="flex justify-between gap-2 text-sm font-semibold">
        <span>
          Vožnja {formatTime(trip.startTime)}–{formatTime(trip.endTime)}
        </span>
        <span>{formatKm(trip.distanceKm)}</span>
      </span>
      <span className="text-[0.8rem] text-muted">
        {trip.driver ? `${trip.driver.name} · ` : ''}
        {formatDuration(trip.durationS)} · max {Math.round(trip.maxSpeedKmh)} km/h
        {trip.end.address ? ` · do ${trip.end.address}` : ''}
      </span>
    </>
  );
}

function StopEntry({ stop, number }: { stop: Stop; number: number }) {
  return (
    <>
      <span className={cn(entryIcon, 'bg-warning')}>{number}</span>
      <span className="flex justify-between gap-2 text-sm font-semibold">
        <span>
          Stajanje {formatTime(stop.startTime)}–{formatTime(stop.endTime)}
        </span>
        <span>{formatDuration(stop.durationS)}</span>
      </span>
      <span className="text-[0.8rem] text-muted">
        {stop.address ?? `${stop.lat?.toFixed(5)}, ${stop.lng?.toFixed(5)}`}
      </span>
    </>
  );
}

function StopPopup({
  stop,
  number,
  canCreate,
}: {
  stop: Stop;
  number: number;
  canCreate: boolean;
}) {
  return (
    <div className="flex min-w-[200px] flex-col gap-1.5">
      <strong>Stajanje {number}</strong>
      <span>
        {formatTime(stop.startTime)}–{formatTime(stop.endTime)} · {formatDuration(stop.durationS)}
      </span>
      {stop.address && <span className="text-muted">{stop.address}</span>}
      {canCreate && (
        <Link
          // Leaflet's unlayered `.leaflet-container a` color would beat a plain utility here.
          className={cn(buttonClass({ variant: 'primary' }), 'text-white!')}
          to={`/locations?${new URLSearchParams({
            new: '1',
            source: 'stop',
            lat: String(stop.lat),
            lng: String(stop.lng),
            name: stop.address ?? '',
            address: stop.address ?? '',
          })}`}
        >
          <MapPinPlus size={16} /> Napravi lokaciju
        </Link>
      )}
    </div>
  );
}
