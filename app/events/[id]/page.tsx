import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import EventView from '@/components/events/EventView';
import BattleView from '@/components/battle/BattleView';
import type { MatchRow, SwissRow } from '@/components/events/Bracket';
import type { SmokeRow } from '@/components/events/SmokeBoard';
import type { BattleJudge, BattleWithPlayers, JudgeVote, Submission, Vote } from '@/lib/types';
import type { EventEntry, EventJudge, EventRow, EventShowcase, StandingRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: event }, { data: judges }, { data: entries }, { data: showcases }, { data: subs }, { data: standings }, { data: auth }] = await Promise.all([
    supabase.from('events').select('*, host:profiles!events_host_id_fkey(username)').eq('id', id).maybeSingle(),
    supabase.from('event_judges').select('judge_id, active, judge:profiles!event_judges_judge_id_fkey(username)').eq('event_id', id).order('created_at'),
    supabase.from('event_entries').select('profile_id, status, stage_order, elim_place, elim_score, final_place, team_id, partner_id, team:teams!event_entries_team_id_fkey(id, name), partner:profiles!event_entries_partner_id_fkey(username), profile:profiles!event_entries_profile_id_fkey(username, country, elo_rating)').eq('event_id', id).order('created_at'),
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

  const [{ data: matches }, { data: swiss }, { data: smoke }] = await Promise.all([
    supabase.from('event_matches').select('*').eq('event_id', id).order('round').order('slot'),
    event.main_format === 'swiss' && ['main', 'finished'].includes(event.status)
      ? supabase.rpc('swiss_standings', { p_event: id }) : Promise.resolve({ data: [] }),
    supabase.from('event_smoke').select('profile_id, points, queue_pos').eq('event_id', id),
  ]);

  // The battle on stage right now, shown inside the event page.
  let stage: React.ReactNode = null;
  if (event.current_battle_id) {
    const bid = event.current_battle_id as string;
    const PLAYER = 'id, username, full_name, avatar_url, country, elo_rating, featured_badge';
    const [{ data: b }, { data: subs2 }, { data: votes }, { data: bj }, { data: jv }] = await Promise.all([
      supabase.from('battles').select(`*, challenger:profiles!battles_challenger_id_fkey(${PLAYER}), opponent:profiles!battles_opponent_id_fkey(${PLAYER}), host:profiles!battles_host_id_fkey(username)`).eq('id', bid).maybeSingle(),
      supabase.from('submissions').select('*').eq('battle_id', bid).order('round_number'),
      supabase.from('votes').select('*, voter:profiles!votes_voter_id_fkey(username)').eq('battle_id', bid),
      supabase.from('battle_judges').select('judge_id, is_reserve, active, judge:profiles!battle_judges_judge_id_fkey(username)').eq('battle_id', bid),
      supabase.from('judge_votes').select('judge_id, voted_for').eq('battle_id', bid),
    ]);
    if (b) {
      stage = (
        <BattleView battle={b as BattleWithPlayers} submissions={(subs2 ?? []) as Submission[]} initialVotes={(votes ?? []) as Vote[]}
          currentUserId={auth.user?.id ?? null} judges={(bj ?? []) as unknown as BattleJudge[]} judgeVotes={(jv ?? []) as JudgeVote[]} />
      );
    }
  }

  const { data: group } = event.group_id
    ? await supabase.from('event_groups').select('id, name, edition, logo_url').eq('id', event.group_id).maybeSingle()
    : { data: null };

  return (
    <EventView
      group={group}
      matches={(matches ?? []) as MatchRow[]}
      swiss={(swiss ?? []) as SwissRow[]}
      smoke={(smoke ?? []) as SmokeRow[]}
      stage={stage}
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
