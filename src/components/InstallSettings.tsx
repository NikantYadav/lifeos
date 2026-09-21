'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePush } from '@/lib/usePush';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const PUSH_LABEL: Record<string, string> = {
  unsupported: 'Notifications aren’t supported in this browser.',
  unconfigured: 'Push isn’t configured on the server yet.',
  denied: 'Notifications are blocked — allow them in your browser/OS settings.',
  'not-subscribed': 'Get a notification for reminders and the Sunday review.',
  subscribed: 'Notifications are on.',
  busy: 'Working…',
};

// Never changes after mount, so an empty subscribe is enough — this just
// gets the read off the server snapshot (false) without a setState-in-effect.
const noopSubscribe = () => () => {};

function useIsStandalone(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => false
  );
}

function useIsIOS(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => /iPad|iPhone|iPod/.test(navigator.userAgent),
    () => false
  );
}

/**
 * Install + notification settings, shown inline (e.g. in the More sheet or a
 * settings panel) rather than as an unprompted popup — this is a personal
 * single-user tool, not a growth surface.
 */
export default function InstallSettings() {
  const { state: pushState, subscribe, unsubscribe } = usePush();
  const isStandalone = useIsStandalone();
  const isIOS = useIsIOS();

  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  return (
    <div className="settings-card">
      <h3>Install</h3>
      {isStandalone ? (
        <p className="settings-note">Already installed.</p>
      ) : installEvent ? (
        <button type="button" className="settings-btn" onClick={install}>
          Add to home screen
        </button>
      ) : isIOS ? (
        <p className="settings-note">
          Tap the Share icon, then &ldquo;Add to Home Screen&rdquo;.
        </p>
      ) : (
        <p className="settings-note">
          Use your browser&apos;s menu (&ldquo;Install app&rdquo; or &ldquo;Add to Home
          Screen&rdquo;) to install.
        </p>
      )}

      <h3>Notifications</h3>
      <p className="settings-note">{PUSH_LABEL[pushState]}</p>
      {(pushState === 'not-subscribed' || pushState === 'subscribed') && (
        <button
          type="button"
          className="settings-btn"
          onClick={() => void (pushState === 'subscribed' ? unsubscribe() : subscribe())}
        >
          {pushState === 'subscribed' ? 'Turn off' : 'Turn on'}
        </button>
      )}
    </div>
  );
}
