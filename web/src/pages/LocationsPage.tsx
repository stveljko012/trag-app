import type { Map as LeafletMap } from 'leaflet';
import { MapPin, Plus, Search, Trash2, X } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useDeleteLocation, useLocations, useSaveLocation } from '../api/queries';
import type { Location } from '../api/types';
import { useMe } from '../auth/useAuth';
import { BaseMap, MapClick } from '../components/map/BaseMap';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EditCircle } from '../components/map/EditCircle';
import { LocationsLayer } from '../components/map/LocationsLayer';
import { formatRate } from '../lib/money';
import { EmptyState, ErrorMessage } from '../components/ui';
import { buttonClass, chipClass, cn, inputClass } from '../lib/ui';

const MIN_RADIUS = 10;
const MAX_RADIUS = 5000;
const SLIDER_MAX = 2000;
const PRESETS = [50, 100, 200, 500, 1000];
const DEFAULT_RADIUS = 100;

interface Draft {
  /** Undefined while creating. */
  id?: number;
  fromStop: boolean;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  /** False for polygons/lines from Traccar: only the details can change here. */
  shapeEditable: boolean;
  address: string;
  notes: string;
  hourlyRate: string;
}

function draftFrom(location: Location): Draft {
  const circle = location.shape?.type === 'circle' ? location.shape : null;
  return {
    id: location.id,
    fromStop: false,
    name: location.name,
    lat: circle?.lat ?? 0,
    lng: circle?.lng ?? 0,
    radiusM: circle?.radiusM ?? DEFAULT_RADIUS,
    shapeEditable: !!circle,
    address: location.address ?? '',
    notes: location.notes ?? '',
    hourlyRate: location.hourlyRate === null ? '' : String(location.hourlyRate),
  };
}

function shapeLabel(location: Location): string {
  if (location.shape?.type === 'circle') return `r ${Math.round(location.shape.radiusM)} m`;
  if (location.shape?.type === 'polygon') return 'poligon';
  return 'linija';
}

function boundsOf(location: Location): [number, number][] | null {
  const shape = location.shape;
  if (!shape) return null;
  if (shape.type !== 'circle') return shape.points;
  // ~1° latitude = 111 km; good enough to frame a circle.
  const d = shape.radiusM / 111_000;
  const dLng = d / Math.cos((shape.lat * Math.PI) / 180);
  return [
    [shape.lat - d, shape.lng - dLng],
    [shape.lat + d, shape.lng + dLng],
  ];
}

export function LocationsPage() {
  const { data: me } = useMe();
  const canEdit = me?.role === 'owner';
  const locations = useLocations();
  const save = useSaveLocation();
  const remove = useDeleteLocation();
  const [params, setParams] = useSearchParams();

  const [map, setMap] = useState<LeafletMap | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const all = useMemo(() => locations.data ?? [], [locations.data]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? all.filter((l) =>
          [l.name, l.address ?? '', l.notes ?? ''].some((t) => t.toLowerCase().includes(q)),
        )
      : all;
  }, [all, query]);

  // Frame all locations once, unless we arrived to create one at a given spot.
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || !map || !locations.isSuccess) return;
    fitted.current = true;
    if (params.get('new') === '1') return;
    const points = all.flatMap((l) => boundsOf(l) ?? []);
    if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time initial fit
  }, [map, locations.isSuccess]);

  // Opened from "Nova lokacija" on the map, or "Napravi lokaciju" on a stop in history.
  useEffect(() => {
    if (params.get('new') !== '1' || !canEdit) return;
    const lat = Number(params.get('lat'));
    const lng = Number(params.get('lng'));
    startNew(Number.isFinite(lat) && lat !== 0 ? [lat, lng] : undefined, {
      fromStop: params.get('source') === 'stop',
      name: params.get('name') ?? '',
      address: params.get('address') ?? '',
    });
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to the URL only
  }, [params, canEdit, map]);

  function startNew(center?: [number, number], extra: Partial<Draft> = {}) {
    const c = center ?? (map ? [map.getCenter().lat, map.getCenter().lng] : [44.8125, 20.4612]);
    setSelectedId(null);
    save.reset();
    setDraft({
      fromStop: false,
      name: '',
      lat: c[0],
      lng: c[1],
      radiusM: DEFAULT_RADIUS,
      shapeEditable: true,
      address: '',
      notes: '',
      hourlyRate: '',
      ...extra,
    });
    map?.setView(c, Math.max(map.getZoom(), 16));
  }

  function select(location: Location) {
    setSelectedId(location.id);
    save.reset();
    setDraft(canEdit ? draftFrom(location) : null);
    const bounds = boundsOf(location);
    if (map && bounds) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 });
  }

  function close() {
    setDraft(null);
    setSelectedId(null);
  }

  function update(patch: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }

  function setRadius(value: number) {
    if (Number.isFinite(value))
      update({ radiusM: Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, Math.round(value))) });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const rate = draft.hourlyRate.trim().replace(',', '.');
    save.mutate(
      {
        id: draft.id,
        fromStop: draft.fromStop,
        input: {
          name: draft.name.trim(),
          ...(draft.shapeEditable
            ? { lat: draft.lat, lng: draft.lng, radius_m: draft.radiusM }
            : {}),
          address: draft.address.trim() || null,
          notes: draft.notes.trim() || null,
          hourly_rate: rate ? Number(rate) : null,
        },
      },
      {
        onSuccess: (saved) => {
          setSelectedId(saved.id);
          setDraft(draftFrom(saved));
        },
      },
    );
  }

  function onDelete() {
    if (!draft?.id) return;
    remove.mutate(draft.id, { onSuccess: close, onSettled: () => setConfirmDelete(false) });
  }

  const editingShape = draft?.shapeEditable ? draft : null;
  const rateInvalid =
    !!draft?.hourlyRate.trim() && !(Number(draft.hourlyRate.trim().replace(',', '.')) >= 0);
  const error = save.error ?? remove.error;

  return (
    <div className="grid h-[calc(100dvh-var(--footer-height))] min-h-[560px] grid-cols-[400px_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] max-md:flex max-md:h-auto max-md:min-h-0 max-md:flex-col">
      <header className="col-span-full flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-surface px-5 py-3.5 max-md:order-first max-md:px-4 max-md:py-3">
        <h1 className="text-[1.4rem] font-extrabold tracking-[-0.01em]">Lokacije</h1>
        <span className="text-muted">{all.length}</span>
      </header>

      <section className="flex min-h-0 flex-col border-r border-border bg-surface max-md:border-r-0">
        {draft ? (
          <form
            className="flex flex-col gap-3.5 overflow-y-auto p-4 max-md:overflow-visible"
            onSubmit={onSubmit}
          >
            <div className="flex items-center gap-2 text-[1.1rem] font-bold">
              <span style={{ flex: 1 }}>{draft.id ? 'Izmena lokacije' : 'Nova lokacija'}</span>
              <button
                type="button"
                className={buttonClass({ icon: true })}
                aria-label="Zatvori"
                onClick={close}
              >
                <X size={18} />
              </button>
            </div>

            {draft.shapeEditable ? (
              <div className="rounded-lg bg-primary-soft px-3 py-2.5 text-[0.85rem] text-primary-hover">
                Kliknite na mapu ili prevucite tačku u centru da pomerite centar. Poluprečnik
                menjajte ispod; krug na mapi se odmah menja, a čuva se tek na „Sačuvaj”.
              </div>
            ) : (
              <div className="rounded-lg bg-primary-soft px-3 py-2.5 text-[0.85rem] text-primary-hover">
                Ova lokacija nije krug; njen oblik se menja samo u GPS sistemu.
              </div>
            )}

            <label className="flex flex-col gap-1.5 text-[0.85rem] font-medium">
              Naziv
              <input
                className={cn(inputClass, 'w-full')}
                required
                maxLength={100}
                value={draft.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="npr. Market Lazić"
              />
            </label>

            {draft.shapeEditable && (
              <div className="flex flex-col gap-1.5 text-[0.85rem] font-medium">
                Poluprečnik
                <div className="flex items-center gap-2.5">
                  <input
                    className="flex-1 accent-primary"
                    type="range"
                    min={MIN_RADIUS}
                    max={Math.max(SLIDER_MAX, draft.radiusM)}
                    step={5}
                    value={draft.radiusM}
                    aria-label="Poluprečnik"
                    onChange={(e) => setRadius(Number(e.target.value))}
                  />
                  <input
                    className={cn(inputClass, 'w-24')}
                    type="number"
                    min={MIN_RADIUS}
                    max={MAX_RADIUS}
                    value={draft.radiusM}
                    aria-label="Poluprečnik u metrima"
                    onChange={(e) => setRadius(Number(e.target.value))}
                  />
                  <span className="text-muted">m</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={cn(chipClass, 'h-7 px-2.5 text-[0.8rem]')}
                      aria-pressed={draft.radiusM === r}
                      onClick={() => setRadius(r)}
                    >
                      {r >= 1000 ? `${r / 1000} km` : `${r} m`}
                    </button>
                  ))}
                </div>
                <span className="font-mono text-[0.8rem] text-muted">
                  Centar: {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}
                </span>
              </div>
            )}

            <label className="flex flex-col gap-1.5 text-[0.85rem] font-medium">
              Adresa
              <input
                className={cn(inputClass, 'w-full')}
                maxLength={300}
                value={draft.address}
                onChange={(e) => update({ address: e.target.value })}
              />
            </label>

            <label className="flex flex-col gap-1.5 text-[0.85rem] font-medium">
              Cena po satu (din)
              <input
                className={cn(inputClass, 'w-full')}
                inputMode="decimal"
                value={draft.hourlyRate}
                onChange={(e) => update({ hourlyRate: e.target.value })}
                placeholder="npr. 1500"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-[0.85rem] font-medium">
              Beleške
              <textarea
                className={cn(inputClass, 'min-h-[84px] w-full resize-y py-2')}
                maxLength={2000}
                value={draft.notes}
                onChange={(e) => update({ notes: e.target.value })}
              />
            </label>

            {rateInvalid && <ErrorMessage>Cena po satu mora biti broj.</ErrorMessage>}
            {error && <ErrorMessage>{error.message}</ErrorMessage>}

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className={buttonClass({ variant: 'primary' })}
                disabled={save.isPending || rateInvalid || !draft.name.trim()}
              >
                {save.isPending ? 'Čuvanje…' : 'Sačuvaj'}
              </button>
              <button type="button" className={buttonClass()} onClick={close}>
                Odustani
              </button>
              {draft.id && (
                <button
                  type="button"
                  className={cn(buttonClass(), 'ml-auto text-danger')}
                  disabled={remove.isPending}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={16} /> Obriši
                </button>
              )}
            </div>
          </form>
        ) : (
          <>
            <label className="relative border-b border-border p-4">
              <Search size={18} className="absolute top-1/2 left-7 -translate-y-1/2 text-muted" />
              <input
                className={cn(inputClass, 'h-11 w-full pl-[38px]')}
                type="search"
                placeholder="Naziv, adresa ili beleška"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <ul className="flex-1 overflow-y-auto max-md:overflow-visible">
              {canEdit && (
                <li>
                  <button
                    type="button"
                    className="grid w-full grid-cols-[28px_minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-l-3 border-b-border border-l-transparent px-4 py-3.5 text-left hover:bg-surface-muted"
                    onClick={() => startNew()}
                  >
                    <span className="row-span-2 grid size-7 place-items-center rounded-lg bg-primary-soft text-primary">
                      <Plus size={16} />
                    </span>
                    <span className="font-semibold text-primary">Nova lokacija</span>
                    <span />
                    <span className="col-span-2 col-start-2 truncate text-[0.85rem] text-muted">
                      Postavite krug na mapi i podesite poluprečnik
                    </span>
                  </button>
                </li>
              )}
              {visible.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    className={cn(
                      'grid w-full grid-cols-[28px_minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-l-3 border-b-border border-l-transparent px-4 py-3.5 text-left hover:bg-surface-muted',
                      l.id === selectedId &&
                        'border-l-primary bg-primary-soft hover:bg-primary-soft',
                    )}
                    onClick={() => select(l)}
                  >
                    <span className="row-span-2 grid size-7 place-items-center rounded-lg bg-green-100 text-green-700">
                      <MapPin size={16} />
                    </span>
                    <span className="font-semibold">{l.name}</span>
                    <span className="whitespace-nowrap text-[0.85rem] font-semibold text-slate-700">
                      {l.hourlyRate !== null ? formatRate(l.hourlyRate) : ''}
                    </span>
                    <span className="col-span-2 col-start-2 truncate text-[0.85rem] text-muted">
                      {[shapeLabel(l), l.address, l.notes].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
              {locations.isPending && (
                <li>
                  <EmptyState>Učitavanje…</EmptyState>
                </li>
              )}
              {locations.isError && (
                <li>
                  <EmptyState>{locations.error.message}</EmptyState>
                </li>
              )}
              {locations.isSuccess && visible.length === 0 && (
                <li>
                  <EmptyState>
                    {all.length
                      ? 'Nema rezultata.'
                      : 'Još nema lokacija. Dodajte prvu klijentsku lokaciju.'}
                  </EmptyState>
                </li>
              )}
            </ul>
          </>
        )}
      </section>

      <div className="relative min-h-0 max-md:order-first max-md:h-[45dvh] max-md:shrink-0">
        <BaseMap className="absolute inset-0" onMap={setMap}>
          <LocationsLayer
            locations={editingShape ? all.filter((l) => l.id !== draft?.id) : all}
            selectedId={selectedId}
            onSelect={(id) => {
              const location = all.find((l) => l.id === id);
              if (location && !editingShape) select(location);
            }}
          />
          {editingShape && (
            <>
              <MapClick onClick={(lat, lng) => update({ lat, lng })} />
              <EditCircle
                lat={editingShape.lat}
                lng={editingShape.lng}
                radiusM={editingShape.radiusM}
                onMove={(lat, lng) => update({ lat, lng })}
              />
            </>
          )}
        </BaseMap>
        {editingShape && (
          <div className="pointer-events-none absolute top-4 left-1/2 z-800 -translate-x-1/2 whitespace-nowrap rounded-full bg-dark px-3.5 py-2 text-[0.85rem] text-white max-md:w-max max-md:max-w-[calc(100%-32px)] max-md:whitespace-normal max-md:text-center">
            Kliknite na mapu da postavite centar
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Obrisati lokaciju?"
        confirmLabel="Obriši"
        pending={remove.isPending}
        onConfirm={onDelete}
      >
        <strong className="text-text">{draft?.name}</strong> se briše zajedno sa geofence-om u GPS
        sistemu.
      </ConfirmDialog>
    </div>
  );
}
