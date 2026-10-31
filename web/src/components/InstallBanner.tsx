import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { ChevronDown, EllipsisVertical, Share, Smartphone, SquarePlus, X } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { consumeInstallPrompt, isIos, useCanInstall, useInstallPrompt } from '../lib/install';
import { buttonClass, cn } from '../lib/ui';

// When the banner was closed (ms since epoch); it comes back after SNOOZE_MS.
const DISMISSED_KEY = 'trag.installBanner.dismissedAt';
const SNOOZE_MS = 7 * 24 * 3600_000;

function readSnoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY));
    return at > 0 && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

/** Phones only: a strip under the top bar that offers installing Trag to the home screen. */
export function InstallBanner({ onInstall }: { onInstall: () => void }) {
  const canInstall = useCanInstall();
  const [snoozed, setSnoozed] = useState(readSnoozed);

  if (!canInstall || snoozed) return null;

  function snooze() {
    setSnoozed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Private mode: the banner just comes back next time.
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border bg-primary-soft py-2 pr-2 pl-4 md:hidden">
      <Smartphone size={18} className="shrink-0 text-primary" />
      <div className="min-w-0 flex-1 text-[0.8rem] leading-snug">
        <div className="font-semibold text-text">Instalirajte Trag na telefon</div>
        <div className="text-muted">Otvara se sa početnog ekrana, preko celog ekrana.</div>
      </div>
      <button
        type="button"
        className={cn(buttonClass({ variant: 'primary' }), 'h-8 shrink-0 px-3 text-[0.8rem]')}
        onClick={onInstall}
      >
        Instaliraj
      </button>
      <button
        type="button"
        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface"
        aria-label="Podseti me kasnije"
        title="Podseti me za 7 dana"
        onClick={snooze}
      >
        <X size={16} />
      </button>
    </div>
  );
}

/** Steps for this platform; on Android Chrome it triggers the browser's own install prompt. */
export function InstallDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const prompt = useInstallPrompt();
  // One section open at a time; the detected platform starts open.
  const [openPlatform, setOpenPlatform] = useState<'ios' | 'android' | null>(
    isIos ? 'ios' : 'android',
  );

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    consumeInstallPrompt();
    if (outcome === 'accepted') onOpenChange(false);
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-3000 animate-fade-in bg-slate-900/45 backdrop-blur-[2px]" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-3000 w-[calc(100vw-32px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 animate-dialog-in rounded-2xl border border-border bg-surface p-5 shadow-pop">
          <div className="flex items-center gap-3">
            <img src="/icon.svg" alt="" className="size-11 shrink-0 rounded-xl" />
            <div>
              <AlertDialog.Title className="text-[1.05rem] font-bold">
                Instalirajte Trag
              </AlertDialog.Title>
              <AlertDialog.Description className="text-sm text-muted">
                Dobićete ikonicu na početnom ekranu, a Trag se otvara kao aplikacija.
              </AlertDialog.Description>
            </div>
          </div>

          {/* Every platform's steps, the detected one open; the link may be passed to someone else. */}
          <div className="mt-4 flex flex-col gap-2">
            <Platform
              title="iPhone i iPad (Safari)"
              detected={isIos}
              open={openPlatform === 'ios'}
              onToggle={() => setOpenPlatform((p) => (p === 'ios' ? null : 'ios'))}
            >
              <Step n={1}>
                U Safariju tapnite <Share size={16} className="inline align-[-3px]" /> <b>Podeli</b>{' '}
                (Share).
              </Step>
              <Step n={2}>
                Izaberite <SquarePlus size={16} className="inline align-[-3px]" />{' '}
                <b>Dodaj na početni ekran</b> (Add to Home Screen).
              </Step>
              <Step n={3}>
                Tapnite <b>Dodaj</b> (Add).
              </Step>
            </Platform>
            <Platform
              title="Android (Chrome)"
              detected={!isIos}
              open={openPlatform === 'android'}
              onToggle={() => setOpenPlatform((p) => (p === 'android' ? null : 'android'))}
            >
              {prompt ? (
                <Step n={1}>
                  Tapnite <b>Instaliraj</b> ispod i potvrdite.
                </Step>
              ) : (
                <>
                  <Step n={1}>
                    U Chrome-u otvorite meni{' '}
                    <EllipsisVertical size={16} className="inline align-[-3px]" /> gore desno.
                  </Step>
                  <Step n={2}>
                    Izaberite <b>Instaliraj aplikaciju</b> ili <b>Dodaj na početni ekran</b>.
                  </Step>
                </>
              )}
            </Platform>
          </div>

          <p className="mt-4 text-[0.8rem] text-muted">
            Posle instalacije se prijavite jednom; aplikacija pamti prijavu kao i browser.
          </p>

          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel className={buttonClass()}>Zatvori</AlertDialog.Cancel>
            {!isIos && prompt && (
              <button
                type="button"
                className={buttonClass({ variant: 'primary' })}
                onClick={() => void install()}
              >
                Instaliraj
              </button>
            )}
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/** One accordion section; the content slides between 0fr and 1fr rows, like the vehicle filter. */
function Platform({
  title,
  detected,
  open,
  onToggle,
  children,
}: {
  title: string;
  detected: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm font-semibold"
      >
        <span>
          {title}
          {detected && <span className="ml-1.5 font-normal text-muted">· vaš uređaj</span>}
        </span>
        <ChevronDown
          size={16}
          className={cn(
            'shrink-0 text-muted transition-transform duration-300',
            open && 'rotate-180',
          )}
        />
      </button>
      {/* Visibility switches at the end of closing, so folded content is not focusable. */}
      <div
        id={id}
        className={cn(
          'grid transition-[grid-template-rows,visibility] duration-300 ease-out motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'invisible grid-rows-[0fr]',
        )}
      >
        <ol className="flex min-h-0 flex-col gap-2.5 overflow-hidden px-3.5 text-sm">
          {children}
          <li aria-hidden className="h-1" />
        </ol>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-[0.8rem] font-bold text-primary">
        {n}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}
