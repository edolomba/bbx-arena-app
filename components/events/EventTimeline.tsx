'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { LOCALE_TAG } from '@/lib/i18n/config';
import Countdown from '@/components/Countdown';

/** Start-to-end bar with a moving "now" marker, like a festival timeline. */
export default function EventTimeline({ startsAt, endsAt }: { startsAt: string; endsAt: string }) {
  const { locale, t: all } = useI18n();
  const t = all.evg;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const iv = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(iv);
  }, []);
  if (now === null) return <div className="h-24" aria-hidden="true" />;
  const a = new Date(startsAt).getTime(), b = new Date(endsAt).getTime();
  const pct = Math.min(100, Math.max(0, ((now - a) / Math.max(1, b - a)) * 100));
  const tag = LOCALE_TAG[locale];
  const short = (ms: number) => new Date(ms).toLocaleDateString(tag, { day: 'numeric', month: 'short' });
  const long = (ms: number) => new Date(ms).toLocaleDateString(tag, { day: 'numeric', month: 'long', year: 'numeric' });
  const state = now < a ? 'before' : now > b ? 'after' : 'during';

  return (
    <div className="grid gap-2">
      <p className="flex flex-wrap items-baseline gap-2 text-sm">
        {state === 'during' && <><span className="size-2 rounded-full bg-win" aria-hidden="true" /><strong className="text-win">{t.happening}</strong><span className="font-mono text-xs text-muted">{t.until(long(b))}</span></>}
        {state === 'before' && <><strong className="text-gold">{t.startsIn}</strong> <Countdown to={startsAt} /></>}
        {state === 'after' && <span className="text-muted">{t.endedOn(long(b))}</span>}
      </p>
      <div className="relative pt-5 pb-5">
        <div className={`flex h-8 items-center rounded-lg px-3 text-xs font-semibold ${state === 'after' ? 'bg-surface-2 text-muted' : state === 'during' ? 'bg-win/85 text-paper shadow-[0_0_24px_-6px_var(--win)]' : 'bg-gold/20 text-gold'}`}>
          {t.theEvent}
        </div>
        {state === 'during' && (
          <div className="absolute top-0 bottom-3 flex flex-col items-center" style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}>
            <span className="font-mono text-[0.6rem] font-bold tracking-widest uppercase">{t.now}</span>
            <span className="w-0.5 flex-1 bg-ink" aria-hidden="true" />
          </div>
        )}
        <div className="absolute right-0 bottom-0 left-0 flex justify-between font-mono text-[0.65rem] text-muted">
          <span>{short(a)}</span><span>{short(b)}</span>
        </div>
      </div>
    </div>
  );
}
