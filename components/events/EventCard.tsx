import Link from 'next/link';
import { EVENT_STATUS_LABEL } from '@/lib/supabase/events';
import type { EventRow } from '@/lib/types';

/** Open events get the pink marker, finished ones the green one. */
export default function EventCard({ e, role, entries }: { e: EventRow; role?: string; entries?: number }) {
  const open = !['finished', 'cancelled'].includes(e.status);
  return (
    <Link href={`/events/${e.id}`} className="grid gap-1.5 rounded-2xl border border-line bg-surface px-4 py-3.5 hover:border-ink">
      <span className="flex items-center gap-2">
        <span className={`size-2.5 shrink-0 rounded-full ${open ? 'bg-sub' : 'bg-win'}`} aria-hidden="true" />
        <span className="truncate font-bold [font-stretch:112%]">{e.title}</span>
      </span>
      <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted">
        <span>{EVENT_STATUS_LABEL[e.status]}{e.live ? ', live now' : ''}</span>
        {role && <span className="text-ink">{role}</span>}
        {typeof entries === 'number' && <span>{entries}/{e.max_participants} registered</span>}
        {e.ranked && e.approved_at && <span>Ranked</span>}
      </span>
    </Link>
  );
}
