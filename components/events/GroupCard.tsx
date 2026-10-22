import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import { LOCALE_TAG } from '@/lib/i18n/config';
import { dateRange, editionColor, groupStatus } from '@/lib/events';
import EventLogo from './EventLogo';
import StatusChip from './StatusChip';
import type { EventGroup, EventRow } from '@/lib/types';

export default async function GroupCard({ g, categories }: { g: EventGroup; categories: EventRow[] }) {
  const { locale, t: all } = await getT();
  const t = all.evg;
  const status = groupStatus(g, categories);
  return (
    <Link href={`/events/g/${g.id}`}
      className={`relative grid h-full grid-cols-[auto_1fr] gap-4 overflow-hidden rounded-2xl border bg-gradient-to-br from-surface-2 to-surface p-4 transition-colors
        ${status === 'live' ? 'border-loss/40 hover:border-loss/70' : 'border-line hover:border-muted'}`}>
      <EventLogo name={g.name} url={g.logo_url} />
      <span className="grid min-w-0 content-start gap-1">
        <span className="flex justify-end"><StatusChip status={status} label={t[status]} /></span>
        <span className="text-lg leading-tight font-bold">
          {g.name}{g.edition && <> <span className={editionColor(g.id)}>{g.edition}</span></>}
        </span>
        <span className="text-sm text-muted">{dateRange(g.starts_at, g.ends_at, LOCALE_TAG[locale])} · Online</span>
        <span className="flex flex-wrap gap-x-3 font-mono text-[0.7rem] text-muted">
          {categories.length > 0 && <span className="text-ink">{t.categoriesN(categories.length)}</span>}
          <span className="truncate">{t.by(g.organizer || `@${g.host?.username ?? ''}`)}</span>
        </span>
      </span>
    </Link>
  );
}
