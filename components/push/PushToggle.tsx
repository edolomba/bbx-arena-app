'use client';

import { useI18n } from '@/components/i18n/I18nProvider';

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
  const t = useI18n().t.settings;
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
      setError(err instanceof Error ? err.message : t.pushFailed);
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
    <section className={box} aria-label={t.pushLabel}>
      {!compact && <h2 className="text-xl font-bold [font-stretch:112%]">{t.pushTitle}</h2>}
      {state === 'ios-install' && (
        <p className={compact ? 'text-muted' : ''}>
          {t.iphone1} <strong>{t.share}</strong>{t.iphone2} <strong>{t.addHome}</strong>{t.iphone3}
        </p>
      )}
      {state === 'unsupported' && <p className="text-muted">{t.unsupported}</p>}
      {state === 'blocked' && (
        <p className={compact ? 'text-muted' : ''}>
          {t.blocked}
        </p>
      )}
      {(state === 'off' || state === 'working') && (
        <>
          <p className={compact ? 'text-muted' : ''}>
            {t.pushPitch}
          </p>
          <button onClick={turnOn} disabled={state === 'working'}
            className="justify-self-start rounded-full bg-ink px-4 py-2 text-paper disabled:opacity-60">
            {state === 'working' ? t.turningOn : t.turnOn}
          </button>
        </>
      )}
      {state === 'on' && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-win">{t.pushOn}</p>
          <button onClick={turnOff} className="rounded-full border border-line px-4 py-2 text-sm">{t.turnOff}</button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-loss">{error}</p>}
    </section>
  );
}
