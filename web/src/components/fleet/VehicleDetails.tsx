import {
  ChevronDown,
  ChevronUp,
  Crosshair,
  Engine,
  Pencil,
  Phone,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { type PointerEvent, useRef, useState } from 'react';
import { useAssignDriver, useDrivers, useVehicleToday } from '../../api/queries';
import { useMe } from '../../auth/useAuth';
import type { RoutePoint, Vehicle } from '../../api/types';
import { formatAgo, formatDuration, formatKm, formatTime } from '../../lib/time';
import { buttonClass, cn, initials, plateClass, STATE_TONE } from '../../lib/ui';
import {
  displayState,
  ignitionLabel,
  placeText,
  STATE_LABEL,
  statusText,
} from '../../lib/vehicleState';
import { Missing } from '../Missing';
import { Select } from '../Select';
import { Badge, ErrorMessage, Stat } from '../ui';

// Radix Select reserves '' for clearing, so "no driver" gets its own value.
const NO_DRIVER = 'none';

export function VehicleDetails({
  vehicle,
  now,
  route,
  routeIndex,
  onRouteIndex,
  following,
  onFollow,
  onClose,
  className,
}: {
  vehicle: Vehicle;
  now: number;
  route: RoutePoint[];
  /** Selected point on today's route; null means "now". */
  routeIndex: number | null;
  onRouteIndex: (index: number | null) => void;
  following: boolean;
  onFollow: (follow: boolean) => void;
  onClose: () => void;
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [editingDriver, setEditingDriver] = useState(false);
  const today = useVehicleToday(vehicle.id);
  const { data: me } = useMe();
  const canEdit = me?.role === 'owner';
  const drivers = useDrivers();
  const assign = useAssignDriver();
  const phone = vehicle.driver?.phone;
  const state = displayState(vehicle);
  const place = placeText(vehicle);
  const p = vehicle.position;
  const online = vehicle.state !== 'offline';
  const last = route.length - 1;
  const scrubbed = routeIndex !== null && routeIndex < last ? route[routeIndex] : undefined;
  const actionClass = 'h-11 w-full whitespace-normal';

  // Phones: drag the header down to collapse the sheet, or up to open it.
  const [dragY, setDragY] = useState<number | null>(null);
  const drag = useRef<{ y: number; t: number; moved: boolean } | null>(null);
  // A drag ends with a click on the header; this keeps it from toggling again.
  const suppressClick = useRef(false);

  function onDragStart(e: PointerEvent<HTMLButtonElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { y: e.clientY, t: performance.now(), moved: false };
    suppressClick.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onDragMove(e: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const dy = e.clientY - drag.current.y;
    if (Math.abs(dy) > 6) drag.current.moved = true;
    if (collapsed) {
      // Open as soon as the finger goes up, not on release: at the bottom edge of a phone the
      // browser often takes over an upward swipe (toolbar, home bar) and cancels the pointer.
      if (dy < -24) {
        drag.current = null;
        suppressClick.current = true;
        setCollapsed(false);
      }
      return;
    }
    // The open sheet follows the finger down.
    if (drag.current.moved) setDragY(Math.max(0, dy));
  }

  function onDragEnd(e: PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    drag.current = null;
    setDragY(null);
    if (!start?.moved) return;
    suppressClick.current = true;
    const dy = e.clientY - start.y;
    const velocity = dy / Math.max(1, performance.now() - start.t); // px per ms
    if (!collapsed && (dy > 80 || velocity > 0.5)) setCollapsed(true);
  }

  return (
    <>
      {/* Phones: the open card is a bottom sheet over a dimmed page; tapping outside collapses it. */}
      {!collapsed && (
        <div
          aria-hidden
          className="fixed inset-0 animate-fade-in bg-slate-900/40 md:hidden"
          style={dragY ? { opacity: Math.max(0, 1 - dragY / 400) } : undefined}
          onClick={() => setCollapsed(true)}
        />
      )}
      <aside
        className={cn(
          'relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_12px_40px_rgb(15_23_42/0.18)]',
          className,
        )}
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragY === null ? 'transform 200ms ease-out' : 'none',
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (suppressClick.current) suppressClick.current = false;
            else setCollapsed((c) => !c);
          }}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={() => {
            drag.current = null;
            setDragY(null);
          }}
          aria-expanded={!collapsed}
          className="relative flex w-full touch-none items-start justify-between gap-2 border-b border-border px-4 py-3.5 text-left select-none md:pointer-events-none"
        >
          {/* Grab handle, a hint that the sheet can be dragged. */}
          <span className="absolute top-1.5 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-slate-300 md:hidden" />
          <span>
            <div className="font-bold">Detalji vozila</div>
            <div className="text-[0.85rem] text-muted">
              {vehicle.name} · {STATE_LABEL[state]} · {place}
            </div>
          </span>
          <span className="md:hidden">
            {collapsed ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </span>
        </button>

        {/* Collapsing is for phones, where the card covers the map; desktop has room for it. */}
        <div
          className={cn(
            'flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pt-[18px] pb-4',
            collapsed && 'max-md:hidden',
          )}
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className={cn(plateClass, 'text-2xl leading-tight')}>{vehicle.name}</div>
              <div className="text-muted">{vehicle.model ?? 'Model nepoznat'}</div>
              <span
                className={cn(
                  'mt-1.5 inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[0.8rem] font-semibold',
                  online
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : 'border-border bg-surface-muted text-muted',
                )}
                title={
                  vehicle.lastUpdate
                    ? `Poslednji signal ${formatAgo(vehicle.lastUpdate, now)}`
                    : 'Nema signala'
                }
              >
                {online ? <Wifi size={13} /> : <WifiOff size={13} />}
                {online ? 'Online' : 'Offline'}
              </span>
            </div>
            <Badge state={state}>{STATE_LABEL[state]}</Badge>
            <button
              type="button"
              className={buttonClass({ icon: true })}
              aria-label="Zatvori"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>

          <div className={cn('rounded-lg border px-3.5 py-3', STATE_TONE[state].panel)}>
            <div className="font-bold">
              {state === 'moving' ? STATE_LABEL.moving : statusText(vehicle, now)}
            </div>
            <div>{place}</div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Stat label="Brzina" value={p ? `${Math.round(p.speedKmh)} km/h` : '-'} />
            <Stat label="Danas" value={today.data ? formatKm(today.data.distanceKm) : '-'} />
            <Stat
              className="col-span-2"
              label={
                <span className="inline-flex items-center gap-1">
                  <Engine
                    size={14}
                    className={cn(
                      p?.ignition === true ? 'text-success' : 'text-slate-400',
                      (p?.ignition ?? null) === null && 'opacity-50',
                    )}
                  />
                  Motor · {ignitionLabel(p?.ignition ?? null)}
                </span>
              }
              value={today.data ? formatDuration(today.data.engineS) : '-'}
            />
          </div>

          <div className="flex flex-col gap-2.5 rounded-lg border border-border p-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft font-bold text-primary">
                {vehicle.driver ? initials(vehicle.driver.name) : '?'}
              </span>
              <span className="min-w-0 flex-1">
                <div className="truncate font-semibold">{vehicle.driver?.name ?? 'Bez vozača'}</div>
                <div className="text-muted">
                  Vozač{vehicle.driver?.phone ? ` · ${vehicle.driver.phone}` : ''}
                </div>
              </span>
              {canEdit && !editingDriver && (
                <button
                  type="button"
                  className={buttonClass({ icon: true })}
                  aria-label="Promeni vozača"
                  title="Promeni vozača"
                  onClick={() => setEditingDriver(true)}
                >
                  <Pencil size={16} />
                </button>
              )}
            </div>
            {canEdit && editingDriver && (
              <Select
                ariaLabel="Izaberi vozača"
                defaultOpen
                // Picking a driver or dismissing the list goes back to the plain view.
                onOpenChange={(open) => !open && setEditingDriver(false)}
                className="w-full"
                value={vehicle.driver ? String(vehicle.driver.id) : NO_DRIVER}
                onValueChange={(v) =>
                  assign.mutate({
                    vehicleId: vehicle.id,
                    driverId: v === NO_DRIVER ? null : Number(v),
                  })
                }
                options={[
                  { value: NO_DRIVER, label: 'Bez vozača' },
                  ...(drivers.data ?? [])
                    .filter((d) => d.active || d.id === vehicle.driver?.id)
                    .map((d) => ({
                      value: String(d.id),
                      label:
                        d.vehicleId !== null && d.vehicleId !== vehicle.id
                          ? `${d.name} (prelazi iz drugog vozila)`
                          : d.name,
                    })),
                ]}
              />
            )}
            {assign.error && <ErrorMessage>{assign.error.message}</ErrorMessage>}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              className={cn(
                buttonClass({ variant: following ? 'primary' : 'default' }),
                actionClass,
              )}
              aria-pressed={following}
              disabled={!p}
              onClick={() => onFollow(!following)}
            >
              <Crosshair size={16} /> {following ? 'Pratim uživo' : 'Prati uživo'}
            </button>
            {phone ? (
              <a
                className={cn(buttonClass(), actionClass)}
                href={`tel:${phone.replace(/[^\d+]/g, '')}`}
              >
                <Phone size={16} /> Pozovi vozača
              </a>
            ) : (
              <button
                type="button"
                className={cn(buttonClass(), actionClass)}
                disabled
                title="Vozač nema telefon"
              >
                <Phone size={16} /> Pozovi vozača
              </button>
            )}
            {['Poruka na Telegram', 'Podeli lokaciju'].map((label) => (
              <Missing key={label}>
                <button type="button" className={cn(buttonClass(), actionClass)}>
                  {label}
                </button>
              </Missing>
            ))}
          </div>

          <div>
            <div className="flex justify-between text-[0.8rem] font-semibold">
              <span className="uppercase tracking-[0.05em] text-muted">Ruta danas</span>
              <span>{scrubbed ? formatTime(scrubbed.time) : 'Sada'}</span>
            </div>
            {route.length > 1 ? (
              <>
                <input
                  className="w-full accent-primary"
                  type="range"
                  min={0}
                  max={last}
                  value={routeIndex ?? last}
                  aria-label="Pozicija na današnjoj ruti"
                  onChange={(e) => {
                    const i = Number(e.target.value);
                    onRouteIndex(i >= last ? null : i);
                  }}
                />
                <div className="flex justify-between text-[0.8rem] text-muted">
                  <span>{formatTime(route[0]!.time)}</span>
                  <span>sada</span>
                </div>
              </>
            ) : (
              <div className="mt-1.5 text-[0.85rem] text-muted">Danas nema kretanja.</div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
