import { useState } from 'react';
import { useEvents, useVehicles } from '../api/queries';
import type { FleetEvent } from '../api/types';
import { Select } from '../components/Select';
import { alarmLabel, EVENT_FILTER_TYPES, eventLabel } from '../lib/events';
import { belgradeDay, formatDateTime } from '../lib/time';
import { EmptyState, ErrorMessage } from '../components/ui';
import { cardClass, cn, inputClass, plateClass } from '../lib/ui';

// Radix Select reserves '' for clearing, so "no filter" gets its own value.
const ALL = 'all';

export function EventsPage() {
  const today = belgradeDay();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [type, setType] = useState('');
  const [vehicle, setVehicle] = useState<number | undefined>();

  const vehicles = useVehicles();
  const validRange = from <= to;
  const events = useEvents({ from, to: validRange ? to : from, type: type || undefined, vehicle });

  return (
    <section className="flex flex-col gap-4 p-6 max-md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.01em]">Događaji</h1>
          <p className="mt-0.5 text-[0.9rem] text-muted">
            {events.data
              ? `${events.data.length} događaja`
              : 'Ulasci u lokacije, alarmi, kontakt i drugo'}
          </p>
        </div>
      </div>

      <div className={cardClass}>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <label className="flex flex-col gap-1 text-[0.8rem] text-muted">
            Od
            <input
              className={inputClass}
              type="date"
              value={from}
              max={today}
              onChange={(e) => e.target.value && setFrom(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-[0.8rem] text-muted">
            Do
            <input
              className={inputClass}
              type="date"
              value={to}
              max={today}
              onChange={(e) => e.target.value && setTo(e.target.value)}
            />
          </label>
          <div className="flex flex-col gap-1 text-[0.8rem] text-muted">
            Vrsta
            <Select
              ariaLabel="Vrsta događaja"
              value={type || ALL}
              onValueChange={(t) => setType(t === ALL ? '' : t)}
              options={[
                { value: ALL, label: 'Sve' },
                ...EVENT_FILTER_TYPES.map((t) => ({ value: t, label: eventLabel(t) })),
              ]}
            />
          </div>
          <div className="flex flex-col gap-1 text-[0.8rem] text-muted">
            Vozilo
            <Select
              ariaLabel="Vozilo"
              value={vehicle !== undefined ? String(vehicle) : ALL}
              onValueChange={(id) => setVehicle(id === ALL ? undefined : Number(id))}
              options={[
                { value: ALL, label: 'Sva vozila' },
                ...(vehicles.data ?? []).map((v) => ({ value: String(v.id), label: v.name })),
              ]}
            />
          </div>
        </div>
        {!validRange && (
          <ErrorMessage className="mx-4 mb-4">Datum „od” mora biti pre datuma „do”.</ErrorMessage>
        )}
      </div>

      <div className={cardClass}>
        {events.isPending && <EmptyState>Učitavanje…</EmptyState>}
        {events.isError && <EmptyState>{events.error.message}</EmptyState>}
        {events.data?.length === 0 && <EmptyState>Nema događaja za izabrani period.</EmptyState>}
        {!!events.data?.length && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[0.9rem]">
              <thead className="max-sm:hidden">
                <tr>
                  <th className="whitespace-nowrap border-b border-border px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.04em] text-muted">
                    Vreme
                  </th>
                  <th className="whitespace-nowrap border-b border-border px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.04em] text-muted">
                    Vozilo
                  </th>
                  <th className="whitespace-nowrap border-b border-border px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.04em] text-muted">
                    Događaj
                  </th>
                  <th className="whitespace-nowrap border-b border-border px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.04em] text-muted">
                    Detalji
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.data.map((e) => (
                  <tr
                    key={e.id}
                    className="group max-sm:grid max-sm:grid-cols-[1fr_auto] max-sm:border-b max-sm:border-border max-sm:px-4 max-sm:py-2.5"
                  >
                    <td className="border-b border-border px-4 py-3 align-top group-last:border-b-0 max-sm:border-0 max-sm:px-0 max-sm:py-0.5 whitespace-nowrap">
                      {formatDateTime(e.time)}
                    </td>
                    <td
                      className={cn(
                        'border-b border-border px-4 py-3 align-top group-last:border-b-0 max-sm:border-0 max-sm:px-0 max-sm:py-0.5 max-sm:text-right',
                        plateClass,
                      )}
                    >
                      {e.vehicleName ?? `#${e.vehicleId}`}
                    </td>
                    <td
                      className={cn(
                        'border-b border-border px-4 py-3 align-top group-last:border-b-0 max-sm:border-0 max-sm:px-0 max-sm:py-0.5 max-sm:col-span-full',
                        e.type === 'alarm' && 'font-semibold text-danger',
                      )}
                    >
                      {eventLabel(e.type)}
                    </td>
                    <td className="border-b border-border px-4 py-3 align-top group-last:border-b-0 max-sm:border-0 max-sm:px-0 max-sm:py-0.5 text-muted max-sm:col-span-full">
                      {eventDetails(e)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function eventDetails(e: FleetEvent): string {
  const parts: string[] = [];
  if (e.geofenceName) parts.push(e.geofenceName);
  if (e.alarm) parts.push(alarmLabel(e.alarm));
  if (e.speedKmh !== null && (e.type === 'deviceOverspeed' || e.alarm === 'overspeed')) {
    parts.push(`${Math.round(e.speedKmh)} km/h`);
  }
  return parts.join(' · ');
}
