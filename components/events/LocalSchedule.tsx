'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { LOCALE_TAG } from '@/lib/i18n/config';
import type { EventSession } from '@/lib/types';

/** Sessions grouped by day, shown in the viewer's own time zone. */
export default function LocalSchedule({ sessions, categories }: { sessions: EventSession[]; categories: { id: string; name: string; audience: string | null }[] }) {
  const { locale, t: all } = useI18n();
  const t = all.evg;
  // Times depend on the viewer's time zone, which only the browser knows.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-40 animate-pulse rounded-2xl border border-line bg-surface" aria-hidden="true" />;
  const tag = LOCALE_TAG[locale];
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, ' ');
  const time = (iso: string) => new Date(iso).toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit' });
  const dayKey = (iso: string) => new Date(iso).toDateString();
  const days = [...new Set(sessions.map((s) => dayKey(s.starts_at)))];

  return (
    <div className="grid gap-3">
      <p className="label">{t.days(days.length)} · {t.localTime} · {tz}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {days.map((d) => {
          const list = sessions.filter((s) => dayKey(s.starts_at) === d);
          return (
            <section key={d} className="grid content-start gap-3 rounded-2xl border border-line bg-surface p-5">
              <h3 className="font-bold capitalize">{new Date(list[0].starts_at).toLocaleDateString(tag, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
              <p className="font-mono text-xs text-muted">{time(list[0].starts_at)} → {time(list[list.length - 1].ends_at)}</p>
              <ol className="grid gap-4 border-t border-line pt-3">
                {list.map((s) => {
                  const cat = categories.find((c) => c.id === s.category_id);
                  return (
                    <li key={s.id} className="grid grid-cols-[3.5rem_1fr] gap-3">
                      <span className="grid content-between font-mono text-sm text-muted">
                        <span>{time(s.starts_at)}</span><span className="text-xs">{time(s.ends_at)}</span>
                      </span>
                      <span className="grid gap-1 border-l border-line pl-3">
                        <span className="font-semibold">{s.title}</span>
                        {cat && <span className="justify-self-start rounded-full border border-line px-2 py-0.5 text-xs text-muted">{cat.name}{cat.audience ? ` · ${cat.audience}` : ''}</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}
