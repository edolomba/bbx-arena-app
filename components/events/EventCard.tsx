import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import type { EventRow } from '@/lib/types';

/** Open events get the pink marker, finished ones the green one. */
export default async function EventCard({ e, role, entries }: { e: EventRow; role?: string; entries?: number }) {
  const { t } = await getT();
  const open = !['finished', 'cancelled'].includes(e.status);
  return (
    <Link href={`/events/${e.id}`} className="grid gap-1.5 rounded-2xl border border-line bg-surface px-4 py-3.5 hover:border-ink">
      <span className="flex items-center gap-2">
        <span className={`size-2.5 shrink-0 rounded-full ${open ? 'bg-sub' : 'bg-win'}`} aria-hidden="true" />
        <span className="truncate font-bold [font-stretch:112%]">{e.title}</span>
      </span>
      <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted">
        <span>{t.ev.status[e.status]}{e.live ? t.ev.liveNow : ''}</span>
        {role && <span className="text-ink">{role}</span>}
        {typeof entries === 'number' && <span>{t.ev.registeredOf(entries, e.max_participants)}</span>}
        {e.ranked && e.approved_at && <span>{t.ev.ranked}</span>}
      </span>
    </Link>
  );
}
