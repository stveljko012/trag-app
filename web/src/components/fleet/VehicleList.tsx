import { ChevronDown, Search } from 'lucide-react';
import { useState } from 'react';
import type { Vehicle } from '../../api/types';
import { countByState, type Filter, FILTERS, summaryText } from '../../lib/fleetFilter';
import { chipClass, cn, inputClass, plateClass, STATE_TONE } from '../../lib/ui';
import { displayState, placeText, STATE_LABEL, statusText } from '../../lib/vehicleState';
import { Dot, EmptyState } from '../ui';

export function VehicleList({
  vehicles,
  visible,
  filter,
  onFilter,
  query,
  onQuery,
  selectedId,
  onSelect,
}: {
  vehicles: Vehicle[];
  visible: Vehicle[];
  filter: Filter;
  onFilter: (f: Filter) => void;
  query: string;
  onQuery: (q: string) => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  // Phones show a collapsible summary instead of the full list.
  const [expanded, setExpanded] = useState(false);
  const counts = countByState(vehicles);

  return (
    <section className="flex min-h-0 flex-col border-r border-border bg-surface max-md:border-r-0 max-md:border-b">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="hidden w-full items-center justify-between gap-3 bg-surface px-4 py-3 text-left max-md:flex"
      >
        <span>
          <div className="font-bold">Vozila · {vehicles.length}</div>
          <div className="text-[0.85rem] text-muted">{summaryText(counts)}</div>
        </span>
        <ChevronDown
          size={20}
          className={cn('transition-transform duration-300', expanded && 'rotate-180')}
        />
      </button>

      {/* Phones: the rows animate between 0fr and 1fr, so it slides open to its own height.
          Visibility switches at the end of closing, so the folded inputs are not focusable. */}
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col max-md:grid max-md:transition-[grid-template-rows,visibility] max-md:duration-300 max-md:ease-out motion-reduce:transition-none',
          expanded ? 'max-md:grid-rows-[1fr]' : 'max-md:invisible max-md:grid-rows-[0fr]',
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col max-md:overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border p-4">
            <label className="relative">
              <Search size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <input
                className={cn(inputClass, 'h-11 w-full pl-[38px] text-[0.95rem]')}
                type="search"
                placeholder="Tablica, vozač ili mesto"
                value={query}
                onChange={(e) => onQuery(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={chipClass}
                  aria-pressed={filter === f}
                  onClick={() => onFilter(f)}
                >
                  {f === 'all' ? 'Svi' : STATE_LABEL[f]}{' '}
                  <span className="opacity-60">{f === 'all' ? vehicles.length : counts[f]}</span>
                </button>
              ))}
            </div>
          </div>

          <ul className="flex-1 overflow-y-auto max-md:overflow-visible">
            {visible.map((v) => {
              const state = displayState(v);
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(v.id);
                      // Phones: fold the list so the map and the details sheet are in view.
                      setExpanded(false);
                    }}
                    className={cn(
                      'grid w-full grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-b border-l-3 border-b-border border-l-transparent px-4 py-3.5 text-left hover:bg-surface-muted',
                      v.id === selectedId &&
                        'border-l-primary bg-primary-soft hover:bg-primary-soft',
                    )}
                  >
                    <Dot state={state} />
                    <span className={cn(plateClass, 'text-[0.95rem]')}>{v.name}</span>
                    <span
                      className={cn(
                        'whitespace-nowrap text-[0.85rem] font-semibold',
                        STATE_TONE[state].text,
                      )}
                    >
                      {statusText(v)}
                    </span>
                    <span className="col-span-2 col-start-2 flex min-w-0 items-center gap-1.5 text-[0.85rem] text-slate-700">
                      {v.model ?? 'Model nepoznat'} ·{' '}
                      {v.driver ? v.driver.name : <span className="text-muted">bez vozača</span>}
                    </span>
                    <span className="col-span-2 col-start-2 truncate text-[0.85rem] text-muted">
                      {placeText(v)}
                    </span>
                  </button>
                </li>
              );
            })}
            {visible.length === 0 && (
              <li>
                <EmptyState>Nema vozila.</EmptyState>
              </li>
            )}
          </ul>

          <div className="border-t border-border px-4 py-3 text-[0.85rem] text-muted">
            Prikazano {visible.length} od {vehicles.length} vozila
          </div>
        </div>
      </div>
    </section>
  );
}
