'use client';

import Link from 'next/link';
import BadgeChip from './BadgeChip';
import { BADGES } from '@/lib/badges';
import { useI18n } from '@/components/i18n/I18nProvider';
import { LOCALE_TAG } from '@/lib/i18n/config';
import { formatDate } from '@/lib/format';

export interface EarnedBadge { badge_code: string; context: { event?: string; event_id?: string; season?: string; week?: string }; earned_at: string }

/** Profile section: earned badges grouped by category, plus the ones still to earn. */
export default function BadgeShelf({ earned, isMe }: { earned: EarnedBadge[]; isMe: boolean }) {
  const { locale, t: tr } = useI18n();
  const t = tr.badges;
  const have = new Set(earned.map((e) => e.badge_code));
  const missing = Object.entries(BADGES).filter(([code]) => !have.has(code));
  const groups = (['battles', 'events', 'ranking', 'community'] as const)
    .map((cat) => ({ cat, items: earned.filter((e) => BADGES[e.badge_code]?.category === cat) }))
    .filter((g) => g.items.length);

  return (
    <section id="badges" className="grid gap-4">
      <h2 className="text-xl font-bold [font-stretch:112%]">{t.title} <span className="num text-muted">{earned.length}</span></h2>
      {earned.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-5 text-muted">{t.none} {isMe ? t.noneMe : ''}</p>
      ) : (
        <div className="grid gap-4">
          {groups.map(({ cat, items }) => (
            <div key={cat} className="grid gap-2">
              <p className="text-sm text-muted">{t.category[cat]}</p>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((e) => (
                  <li key={`${e.badge_code}-${e.context.event_id ?? e.context.season ?? e.context.week ?? ''}`} className="grid gap-1 rounded-xl border border-line bg-surface p-3">
                    <span><BadgeChip code={e.badge_code} /></span>
                    <span className="text-sm">{t.desc[e.badge_code] ?? BADGES[e.badge_code].description}</span>
                    <span className="text-xs text-muted">
                      {e.context.event_id ? <Link href={`/events/${e.context.event_id}`} className="underline underline-offset-4">{e.context.event}</Link>
                        : e.context.season ?? (e.context.week ? e.context.week.replace(/^(\d{4})-W(\d+)$/, (_, y, w) => t.week(Number(w), y)) : '')}
                      {(e.context.event || e.context.season || e.context.week) ? ', ' : ''}{formatDate(e.earned_at, LOCALE_TAG[locale])}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {missing.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-muted">{isMe ? t.toEarn : t.all} ({missing.length})</summary>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {missing.map(([code, b]) => (
              <li key={code} className="grid gap-1 rounded-xl border border-dashed border-line p-3 opacity-70">
                <span className="text-sm font-semibold">{b.name} <span className="font-normal text-muted">({t.rarity[b.rarity]})</span></span>
                <span className="text-sm text-muted">{t.desc[code] ?? b.description}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
