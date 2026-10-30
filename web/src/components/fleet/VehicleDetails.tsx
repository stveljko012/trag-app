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
import { useState } from 'react';
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

  return (
    <aside
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_12px_40px_rgb(15_23_42/0.18)]',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="flex w-full items-start justify-between gap-2 border-b border-border px-4 py-3.5 text-left"
      >
        <span>
          <div className="font-bold">Detalji vozila</div>
          <div className="text-[0.85rem] text-muted">
            {vehicle.name} · {STATE_LABEL[state]} · {place}
          </div>
        </span>
        {collapsed ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>

      {!collapsed && (
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pt-[18px] pb-4">
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
      )}
    </aside>
  );
}
