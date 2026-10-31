import { Plus, Search, Trash2, X } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import {
  useAssignDriver,
  useDeleteDriver,
  useDrivers,
  useSaveDriver,
  useVehicles,
} from '../api/queries';
import { ApiError } from '../api/client';
import type { Driver } from '../api/types';
import { useMe } from '../auth/useAuth';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Select } from '../components/Select';
import { EmptyState, ErrorMessage } from '../components/ui';
import { formatDateTime } from '../lib/time';
import { buttonClass, cn, initials, inputClass, plateClass } from '../lib/ui';
import { PageTitle } from '../components/PageTitle';

// Radix Select reserves '' for clearing, so "no vehicle" gets its own value.
const NO_VEHICLE = 'none';

interface Draft {
  /** Undefined while creating. */
  id?: number;
  name: string;
  phone: string;
  notes: string;
  active: boolean;
}

const emptyDraft: Draft = { name: '', phone: '', notes: '', active: true };

function draftFrom(d: Driver): Draft {
  return { id: d.id, name: d.name, phone: d.phone ?? '', notes: d.notes ?? '', active: d.active };
}

const fieldClass = 'flex flex-col gap-1.5 text-[0.85rem] font-medium';
const itemClass =
  'grid w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-b border-l-3 border-b-border border-l-transparent px-4 py-3.5 text-left hover:bg-surface-muted';

export function DriversPage() {
  const { data: me } = useMe();
  const canEdit = me?.role === 'owner';
  const drivers = useDrivers();
  const vehicles = useVehicles();
  const save = useSaveDriver();
  const assign = useAssignDriver();
  const remove = useDeleteDriver();

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<'delete' | 'deactivate' | null>(null);

  const all = useMemo(() => drivers.data ?? [], [drivers.data]);
  const vehicleName = useMemo(
    () => new Map((vehicles.data ?? []).map((v) => [v.id, v.name])),
    [vehicles.data],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((d) =>
      [
        d.name,
        d.phone ?? '',
        d.notes ?? '',
        d.vehicleId !== null ? (vehicleName.get(d.vehicleId) ?? '') : '',
      ].some((t) => t.toLowerCase().includes(q)),
    );
  }, [all, query, vehicleName]);
  const selected = all.find((d) => d.id === selectedId) ?? null;

  function open(driver: Driver) {
    setSelectedId(driver.id);
    setDraft(draftFrom(driver));
    save.reset();
    assign.reset();
    remove.reset();
  }

  function startNew() {
    setSelectedId(null);
    setDraft({ ...emptyDraft });
    save.reset();
  }

  function close() {
    setSelectedId(null);
    setDraft(null);
  }

  function update(patch: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    save.mutate(
      {
        id: draft.id,
        input: {
          name: draft.name.trim(),
          phone: draft.phone.trim() || null,
          notes: draft.notes.trim() || null,
          ...(draft.id !== undefined ? { active: draft.active } : {}),
        },
      },
      { onSuccess: (saved) => open(saved) },
    );
  }

  function onDelete() {
    if (!draft?.id) return;
    remove.mutate(draft.id, { onSuccess: close, onSettled: () => setConfirm(null) });
  }

  function deactivate() {
    if (!selected) return;
    remove.reset();
    save.mutate(
      { id: selected.id, input: { active: false } },
      { onSuccess: (saved) => open(saved), onSettled: () => setConfirm(null) },
    );
  }

  function onVehicleChange(value: string) {
    if (!selected) return;
    if (value === NO_VEHICLE) {
      if (selected.vehicleId !== null)
        assign.mutate({ vehicleId: selected.vehicleId, driverId: null });
    } else {
      assign.mutate({ vehicleId: Number(value), driverId: selected.id });
    }
  }

  const error = save.error ?? assign.error ?? remove.error;
  // 409 on delete: the driver has trip history, so offer deactivation instead.
  const offerDeactivate =
    remove.error instanceof ApiError && remove.error.status === 409 && selected?.active === true;

  return (
    <div className="grid h-[calc(100dvh-var(--footer-height))] min-h-[560px] grid-cols-[400px_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] max-md:flex max-md:h-auto max-md:min-h-0 max-md:flex-col">
      <header className="col-span-full flex items-center gap-4 border-b border-border bg-surface px-5 py-3.5 max-md:px-4 max-md:py-3">
        <PageTitle>
          <h1 className="text-[1.4rem] font-extrabold tracking-[-0.01em]">Vozači</h1>
          <span className="text-muted">{all.length}</span>
        </PageTitle>
      </header>

      <section
        className={cn(
          'flex min-h-0 flex-col border-r border-border bg-surface max-md:border-r-0',
          draft && 'max-md:hidden',
        )}
      >
        <label className="relative border-b border-border p-4">
          <Search size={18} className="absolute top-1/2 left-7 -translate-y-1/2 text-muted" />
          <input
            className={cn(inputClass, 'h-11 w-full pl-[38px]')}
            type="search"
            placeholder="Ime, telefon ili vozilo"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <ul className="flex-1 overflow-y-auto max-md:overflow-visible">
          {canEdit && (
            <li>
              <button type="button" className={itemClass} onClick={startNew}>
                <span className="row-span-2 grid size-9 place-items-center rounded-full bg-primary-soft text-primary">
                  <Plus size={18} />
                </span>
                <span className="font-semibold text-primary">Novi vozač</span>
                <span />
                <span className="col-span-2 col-start-2 text-[0.85rem] text-muted">
                  Dodajte vozača i dodelite mu vozilo
                </span>
              </button>
            </li>
          )}
          {visible.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => open(d)}
                className={cn(
                  itemClass,
                  d.id === selectedId && 'border-l-primary bg-primary-soft hover:bg-primary-soft',
                  !d.active && 'opacity-60',
                )}
              >
                <span className="row-span-2 grid size-9 place-items-center rounded-full bg-dark text-[0.8rem] font-bold text-white">
                  {initials(d.name)}
                </span>
                <span className="truncate font-semibold">{d.name}</span>
                <span className="text-[0.85rem]">
                  {!d.active ? (
                    <span className="text-muted">neaktivan</span>
                  ) : d.vehicleId !== null ? (
                    <span className={plateClass}>
                      {vehicleName.get(d.vehicleId) ?? `#${d.vehicleId}`}
                    </span>
                  ) : (
                    <span className="text-muted">bez vozila</span>
                  )}
                </span>
                <span className="col-span-2 col-start-2 truncate text-[0.85rem] text-muted">
                  {[d.phone, d.notes].filter(Boolean).join(' · ') || ' '}
                </span>
              </button>
            </li>
          ))}
          {drivers.isPending && (
            <li>
              <EmptyState>Učitavanje…</EmptyState>
            </li>
          )}
          {drivers.isError && (
            <li>
              <EmptyState>{drivers.error.message}</EmptyState>
            </li>
          )}
          {drivers.isSuccess && visible.length === 0 && (
            <li>
              <EmptyState>{all.length ? 'Nema rezultata.' : 'Još nema vozača.'}</EmptyState>
            </li>
          )}
        </ul>
      </section>

      <section className="min-h-0 overflow-y-auto p-6 max-md:p-4">
        {!draft ? (
          <EmptyState>
            {canEdit ? 'Izaberite vozača ili dodajte novog.' : 'Izaberite vozača.'}
          </EmptyState>
        ) : (
          <form
            onSubmit={onSubmit}
            className="mx-auto flex max-w-[560px] flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-card"
          >
            <div className="flex items-center gap-2 text-[1.1rem] font-bold">
              <span className="flex-1">{draft.id ? 'Vozač' : 'Novi vozač'}</span>
              <button
                type="button"
                className={buttonClass({ icon: true })}
                aria-label="Zatvori"
                onClick={close}
              >
                <X size={18} />
              </button>
            </div>

            <fieldset disabled={!canEdit} className="flex flex-col gap-4">
              <label className={fieldClass}>
                Ime i prezime
                <input
                  className={cn(inputClass, 'w-full')}
                  required
                  maxLength={100}
                  value={draft.name}
                  onChange={(e) => update({ name: e.target.value })}
                  placeholder="npr. Marko Stojanović"
                />
              </label>
              <label className={fieldClass}>
                Telefon
                <input
                  className={cn(inputClass, 'w-full')}
                  type="tel"
                  maxLength={40}
                  value={draft.phone}
                  onChange={(e) => update({ phone: e.target.value })}
                  placeholder="npr. +381 62 123 4567"
                />
              </label>
              <label className={fieldClass}>
                Beleške
                <textarea
                  className={cn(inputClass, 'min-h-[84px] w-full resize-y py-2')}
                  maxLength={2000}
                  value={draft.notes}
                  onChange={(e) => update({ notes: e.target.value })}
                />
              </label>
              {draft.id !== undefined && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={draft.active}
                    onChange={(e) => update({ active: e.target.checked })}
                  />
                  Aktivan
                  {!draft.active && selected?.active && (
                    <span className="text-muted">(posle čuvanja se skida sa vozila)</span>
                  )}
                </label>
              )}
            </fieldset>

            {selected && selected.active && (
              <div className={fieldClass}>
                Vozilo
                <Select
                  ariaLabel="Vozilo"
                  className="w-full"
                  mono
                  disabled={!canEdit || assign.isPending}
                  value={selected.vehicleId !== null ? String(selected.vehicleId) : NO_VEHICLE}
                  onValueChange={onVehicleChange}
                  options={[
                    { value: NO_VEHICLE, label: 'Bez vozila' },
                    ...(vehicles.data ?? []).map((v) => ({
                      value: String(v.id),
                      label:
                        v.driver && v.driver.id !== selected.id
                          ? `${v.name} (sada ${v.driver.name})`
                          : v.name,
                    })),
                  ]}
                />
                {selected.since && (
                  <span className="text-[0.8rem] font-normal text-muted">
                    Od {formatDateTime(selected.since)}
                  </span>
                )}
              </div>
            )}

            {error && (
              <ErrorMessage className="flex flex-wrap items-center gap-3">
                <span className="flex-1">{error.message}</span>
                {offerDeactivate && (
                  <button
                    type="button"
                    className={buttonClass()}
                    disabled={save.isPending}
                    // Someone driving right now is taken off the vehicle, so ask first.
                    onClick={() =>
                      selected?.vehicleId !== null ? setConfirm('deactivate') : deactivate()
                    }
                  >
                    Deaktiviraj
                  </button>
                )}
              </ErrorMessage>
            )}

            {canEdit && (
              <div className="flex gap-2">
                <button
                  type="submit"
                  className={buttonClass({ variant: 'primary' })}
                  disabled={save.isPending || !draft.name.trim()}
                >
                  {save.isPending ? 'Čuvanje…' : 'Sačuvaj'}
                </button>
                <button type="button" className={buttonClass()} onClick={close}>
                  Odustani
                </button>
                {draft.id !== undefined && (
                  <button
                    type="button"
                    className={cn(buttonClass(), 'ml-auto text-danger')}
                    disabled={remove.isPending}
                    onClick={() => setConfirm('delete')}
                  >
                    <Trash2 size={16} /> Obriši
                  </button>
                )}
              </div>
            )}
          </form>
        )}
      </section>

      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Obrisati vozača?"
        confirmLabel="Obriši"
        pending={remove.isPending}
        onConfirm={onDelete}
      >
        <strong className="text-text">{draft?.name}</strong> se trajno briše iz liste vozača.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'deactivate'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Deaktivirati vozača?"
        confirmLabel="Deaktiviraj"
        pending={save.isPending}
        onConfirm={deactivate}
      >
        <strong className="text-text">{selected?.name}</strong> trenutno vozi{' '}
        <span className={cn(plateClass, 'text-text')}>
          {selected?.vehicleId != null
            ? (vehicleName.get(selected.vehicleId) ?? `#${selected.vehicleId}`)
            : ''}
        </span>
        . Deaktivacija ga odmah skida sa vozila. Vožnja u toku ostaje upisana na njega.
      </ConfirmDialog>
    </div>
  );
}
