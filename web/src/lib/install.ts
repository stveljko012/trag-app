import { useEffect, useState, useSyncExternalStore } from 'react';

// Chrome's install prompt event (not in the DOM typings).
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

// Chrome fires beforeinstallprompt once, often before React mounts, so it is caught at module load.
let installPrompt: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // Keep Chrome's own mini-infobar away; the banner offers it instead.
  installPrompt = e as InstallPromptEvent;
  notify();
});
window.addEventListener('appinstalled', () => {
  installed = true;
  installPrompt = null;
  notify();
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const ua = navigator.userAgent;
// iPadOS reports itself as a Mac; touch support tells them apart.
export const isIos =
  /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
export const isAndroid = /Android/.test(ua);

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Whether this device can still install Trag: a phone or tablet, not already running the app. */
export function useCanInstall(): boolean {
  const isInstalled = useSyncExternalStore(subscribe, () => installed);
  const [standalone, setStandalone] = useState(isStandalone);

  useEffect(() => {
    const query = window.matchMedia('(display-mode: standalone)');
    const update = () => setStandalone(isStandalone());
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return (isIos || isAndroid) && !standalone && !isInstalled;
}

/** Chrome's deferred install prompt, or null where the browser has none (iOS, Firefox). */
export function useInstallPrompt(): InstallPromptEvent | null {
  return useSyncExternalStore(subscribe, () => installPrompt);
}

/** A prompt can only be shown once; drop it after use. */
export function consumeInstallPrompt() {
  installPrompt = null;
  notify();
}
