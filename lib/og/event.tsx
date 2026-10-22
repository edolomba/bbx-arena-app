import { ImageResponse } from 'next/og';
import { C, OG_SIZE, ogClient, ogFonts, squarePng } from './assets';
import { EventCard, SiteCard } from './cards';
import { dateRange, groupStatus } from '@/lib/events';
import type { EventGroup, EventRow } from '@/lib/types';

/** Share image for an event (also used by its categories). */
export async function eventImage(groupId: string | null, categoryName?: string | null) {
  const fonts = await ogFonts();
  const db = ogClient();
  const { data: g } = groupId
    ? await db.from('event_groups').select('*, host:profiles!event_groups_host_id_fkey(username)').eq('id', groupId).maybeSingle()
    : { data: null };
  if (!g) return new ImageResponse(<SiteCard />, { ...OG_SIZE, fonts });
  const group = g as EventGroup;
  const { data: cats } = await db.from('events').select('status, live').eq('group_id', group.id);
  const st = groupStatus(group, (cats ?? []) as EventRow[]);
  const status = st === 'live' ? { label: 'LIVE', color: C.loss } : st === 'upcoming' ? { label: 'UPCOMING', color: C.gold } : { label: 'FINISHED', color: C.win };
  return new ImageResponse(
    <EventCard name={categoryName ? `${group.name} · ${categoryName}` : group.name} edition={group.edition}
      logo={await squarePng(group.logo_url, 300)} dates={dateRange(group.starts_at, group.ends_at, 'en-GB')}
      organizer={group.organizer || `@${group.host?.username ?? ''}`} status={status} />,
    { ...OG_SIZE, fonts });
}
