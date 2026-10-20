import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import EventView from '@/components/events/EventView';
import type { EventEntry, EventJudge, EventRow, EventShowcase, StandingRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: event }, { data: judges }, { data: entries }, { data: showcases }, { data: subs }, { data: standings }, { data: auth }] = await Promise.all([
    supabase.from('events').select('*, host:profiles!events_host_id_fkey(username)').eq('id', id).maybeSingle(),
    supabase.from('event_judges').select('judge_id, active, judge:profiles!event_judges_judge_id_fkey(username)').eq('event_id', id).order('created_at'),
    supabase.from('event_entries').select('profile_id, status, stage_order, elim_place, elim_score, profile:profiles!event_entries_profile_id_fkey(username, country, elo_rating)').eq('event_id', id).order('created_at'),
    supabase.from('event_showcases').select('profile_id, audio_path, duration_ms, waveform_data, integrated_lufs').eq('event_id', id),
    supabase.from('elimination_submissions').select('judge_id, submitted_at').eq('event_id', id),
    supabase.rpc('event_standings', { p_event: id }),
    supabase.auth.getUser(),
  ]);
  if (!event) notFound();

  let myRanking: string[] = [];
  if (auth.user) {
    const { data } = await supabase.from('elimination_rankings').select('profile_id, position').eq('event_id', id).eq('judge_id', auth.user.id).order('position');
    myRanking = (data ?? []).map((r) => r.profile_id);
  }

  return (
    <EventView
      event={event as EventRow}
      judges={(judges ?? []) as unknown as EventJudge[]}
      entries={(entries ?? []) as unknown as EventEntry[]}
      showcases={(showcases ?? []) as EventShowcase[]}
      submissions={subs ?? []}
      standings={(standings ?? []) as StandingRow[]}
      myRanking={myRanking}
      currentUserId={auth.user?.id ?? null}
    />
  );
}
