import {
  Bell,
  ClipboardList,
  History,
  LogOut,
  type LucideIcon,
  Map,
  MapPin,
  MessageSquare,
  Smartphone,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { useAppConfig, useVehicles } from '../api/queries';
import { useLogout, useMe } from '../auth/useAuth';
import { buttonClass, cn, initials } from '../lib/ui';
import { Footer } from './Footer';
import { useCanInstall } from '../lib/install';
import { InstallBanner, InstallDialog } from './InstallBanner';
import { Logo } from './Logo';

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/', label: 'Mapa', icon: Map },
  { to: '/history', label: 'Istorija', icon: History },
  { to: '/drivers', label: 'Vozači', icon: Users },
  { to: '/locations', label: 'Lokacije', icon: MapPin },
  { to: '/work-log', label: 'Dnevnik rada', icon: ClipboardList },
  { to: '/events', label: 'Događaji', icon: Bell },
  { to: '/assistant', label: 'Asistent', icon: MessageSquare },
];

const ROLE_LABEL = { owner: 'Vlasnik', viewer: 'Pregled' } as const;

export function Layout() {
  const { data: user } = useMe();
  const logout = useLogout();
  const vehicles = useVehicles();
  const clientName = useAppConfig().data?.clientName;
  const [menuOpen, setMenuOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const canInstall = useCanInstall();
  const hasAlarm = vehicles.data?.some((v) => v.alarm && v.state !== 'offline') ?? false;

  return (
    <div className="flex h-dvh overflow-hidden max-md:flex-col">
      <aside
        className={cn(
          'flex w-(--rail-width) shrink-0 flex-col items-center gap-1.5 border-r border-border bg-surface py-4',
          'max-md:h-(--topbar-height) max-md:w-auto max-md:flex-row max-md:border-r-0 max-md:border-b max-md:px-3 max-md:py-0',
        )}
      >
        <Link to="/" aria-label="Trag" className="mb-3.5 shrink-0 max-md:mr-1 max-md:mb-0">
          <Logo className="size-10" />
        </Link>
        <nav className="flex flex-col items-center gap-1.5 max-md:flex-row max-md:gap-0.5 max-md:overflow-x-auto max-md:[scrollbar-width:none]">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              aria-label={label}
              className={({ isActive }) =>
                cn(
                  'group relative grid size-12 shrink-0 place-items-center rounded-xl text-slate-600 hover:bg-surface-muted hover:text-text max-md:size-11',
                  isActive &&
                    'bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary',
                )
              }
            >
              <Icon size={21} />
              {to === '/events' && hasAlarm && (
                <span className="absolute top-[9px] right-[9px] size-[9px] rounded-full border-2 border-surface bg-danger" />
              )}
              {/* Tooltip with the page name (desktop only). */}
              <span className="pointer-events-none absolute top-1/2 left-[calc(100%+10px)] z-2000 -translate-y-1/2 whitespace-nowrap rounded-md bg-dark px-2.5 py-1 text-[0.8rem] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 max-md:hidden">
                {label}
              </span>
            </NavLink>
          ))}
        </nav>
        {user && (
          <div className="relative mt-auto max-md:mt-0 max-md:ml-auto max-md:pl-2">
            <button
              type="button"
              aria-label="Nalog"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="grid size-10 place-items-center rounded-full bg-dark text-[0.8rem] font-bold text-white"
            >
              {initials(user.name)}
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-1500" onClick={() => setMenuOpen(false)} />
                <div
                  role="menu"
                  className="absolute bottom-0 left-[calc(100%+10px)] z-1600 min-w-[220px] rounded-xl border border-border bg-surface p-3 shadow-pop max-md:top-[calc(100%+8px)] max-md:right-0 max-md:bottom-auto max-md:left-auto"
                >
                  {clientName && (
                    <div className="mb-1.5 text-[0.75rem] font-semibold tracking-[0.04em] text-primary uppercase">
                      {clientName}
                    </div>
                  )}
                  <div className="font-semibold">{user.name}</div>
                  <div className="mb-2.5 text-[0.85rem] text-muted">
                    {ROLE_LABEL[user.role]} · {user.email}
                  </div>
                  {canInstall && (
                    <button
                      type="button"
                      className={cn(buttonClass(), 'mb-2 w-full')}
                      onClick={() => {
                        setMenuOpen(false);
                        setInstallOpen(true);
                      }}
                    >
                      <Smartphone size={16} /> Instaliraj aplikaciju
                    </button>
                  )}
                  <button
                    type="button"
                    className={cn(buttonClass(), 'w-full')}
                    disabled={logout.isPending}
                    onClick={() => logout.mutate()}
                  >
                    <LogOut size={16} /> Odjavi se
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </aside>

      <InstallBanner onInstall={() => setInstallOpen(true)} />
      <InstallDialog open={installOpen} onOpenChange={setInstallOpen} />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <main className="flex flex-[1_0_auto] flex-col">
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  );
}
