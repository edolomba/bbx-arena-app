'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type State = 'loading' | 'unsupported' | 'ios-install' | 'blocked' | 'off' | 'on' | 'working';

function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Turns phone/computer notifications on or off for this device. */
export default function PushToggle({ compact = false }: { compact?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<State>('loading');
  const [error, setError] = useState<string | null>(null);
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    (async () => {
      if (!vapid || !('serviceWorker' in navigator)) return setState('unsupported');
      if (!('PushManager' in window) || !('Notification' in window)) {
        return setState(isIos() && !isStandalone() ? 'ios-install' : 'unsupported');
      }
      if (Notification.permission === 'denied') return setState('blocked');
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? 'on' : 'off');
    })().catch(() => setState('unsupported'));
  }, [vapid]);

  async function turnOn() {
    setError(null);
    setState('working');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return setState(permission === 'denied' ? 'blocked' : 'off');
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription())
        ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(vapid!) }));
      const json = sub.toJSON();
      const { error } = await supabase.rpc('save_push_subscription', {
        p_endpoint: sub.endpoint,
        p_p256dh: json.keys?.p256dh,
        p_auth: json.keys?.auth,
        p_user_agent: navigator.userAgent,
      });
      if (error) throw error;
      setState('on');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Notifications couldn’t be turned on.');
      setState('off');
    }
  }

  async function turnOff() {
    setState('working');
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
    setState('off');
  }

  if (state === 'loading') return null;
  if (compact && (state === 'on' || state === 'unsupported')) return null;

  const box = compact ? 'grid gap-2 border-b border-line px-4 py-3 text-sm' : 'grid max-w-xl gap-3 rounded-2xl border border-line p-5';

  return (
    <section className={box} aria-label="Phone notifications">
      {!compact && <h2 className="text-xl font-bold [font-stretch:112%]">Phone and computer notifications</h2>}
      {state === 'ios-install' && (
        <p className={compact ? 'text-muted' : ''}>
          On iPhone, notifications work once BBX Arena is on your home screen: tap <strong>Share</strong>, then
          <strong> Add to Home Screen</strong>, and open it from there.
        </p>
      )}
      {state === 'unsupported' && <p className="text-muted">This browser can’t receive notifications. Try Chrome, Edge, Firefox or Safari.</p>}
      {state === 'blocked' && (
        <p className={compact ? 'text-muted' : ''}>
          Notifications are blocked for this site. Allow them in your browser’s site settings (the icon next to the address), then reload.
        </p>
      )}
      {(state === 'off' || state === 'working') && (
        <>
          <p className={compact ? 'text-muted' : ''}>
            Get told when you’re challenged, when it’s your turn and when your live battle starts, even with the site closed.
          </p>
          <button onClick={turnOn} disabled={state === 'working'}
            className="justify-self-start rounded-full bg-ink px-4 py-2 text-paper disabled:opacity-60">
            {state === 'working' ? 'Turning on…' : 'Turn on notifications'}
          </button>
        </>
      )}
      {state === 'on' && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-win">Notifications are on for this device.</p>
          <button onClick={turnOff} className="rounded-full border border-line px-4 py-2 text-sm">Turn off</button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-loss">{error}</p>}
    </section>
  );
}
