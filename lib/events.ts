import type { EventGroup, EventRow } from '@/lib/types';

export type GroupStatus = 'live' | 'upcoming' | 'finished';

/** Live while a category is running live; finished when its dates are over and nothing is still running. */
export function groupStatus(g: Pick<EventGroup, 'starts_at' | 'ends_at'>, categories: Pick<EventRow, 'status' | 'live'>[], now = Date.now()): GroupStatus {
  if (categories.some((c) => c.live)) return 'live';
  const running = categories.some((c) => !['finished', 'cancelled'].includes(c.status));
  if (new Date(g.ends_at).getTime() < now && !running) return 'finished';
  if (categories.length > 0 && !running) return 'finished';
  return 'upcoming';
}

/** Each event's edition gets one of the brand colours, always the same for the same event. */
const EDITION = ['text-gold', 'text-sub', 'text-signal', 'text-win'];
export const editionColor = (seed: string) => EDITION[[...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 3) % EDITION.length];

/** "17 – 24 Oct 2026", "31 Oct 2026", "30 Oct – 2 Nov 2026" in the reader's language. */
export function dateRange(startIso: string, endIso: string, tag: string) {
  const a = new Date(startIso), b = new Date(endIso);
  const day = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString(tag, o);
  if (a.toDateString() === b.toDateString()) return day(a, { day: 'numeric', month: 'short', year: 'numeric' });
  const sameYear = a.getFullYear() === b.getFullYear();
  return `${day(a, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })} – ${day(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
