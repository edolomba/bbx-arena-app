import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import BattleView from '@/components/battle/BattleView';
import type { BattleJudge, BattleWithPlayers, JudgeVote, Submission, Vote } from '@/lib/types';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return {};
  const supabase = await createClient();
  const { data: b } = await supabase.from('battles')
    .select('status, mode, challenger:profiles!battles_challenger_id_fkey(username), opponent:profiles!battles_opponent_id_fkey(username)')
    .eq('id', id).maybeSingle();
  if (!b) return {};
  const a = (b.challenger as unknown as { username: string } | null)?.username;
  const o = (b.opponent as unknown as { username: string } | null)?.username;
  const title = o ? `@${a} vs @${o}` : `@${a}: open challenge`;
  const description = b.status === 'voting' ? 'Listen to both rounds and vote on Beatbox Arena.'
    : b.status === 'open' ? 'Open beatbox battle: anyone can take it on Beatbox Arena.'
    : `${b.mode === 'stage' ? 'Live stage battle' : 'Beatbox battle'} on Beatbox Arena.`;
  return { title, description, openGraph: { title, description }, twitter: { title, description } };
}

const PLAYER = 'id, username, full_name, avatar_url, country, elo_rating, featured_badge';

export const dynamic = 'force-dynamic';

export default async function BattlePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();

  // Push the battle past any deadline before reading it, so the page is never stale.
  await supabase.rpc('advance_battle', { p_battle_id: id });

  const [{ data: battle }, { data: submissions }, { data: votes }, { data: auth }, { data: invite }, { data: judges }, { data: judgeVotes }] = await Promise.all([
    supabase
      .from('battles')
      .select(`*, challenger:profiles!battles_challenger_id_fkey(${PLAYER}), opponent:profiles!battles_opponent_id_fkey(${PLAYER}), host:profiles!battles_host_id_fkey(username)`)
      .eq('id', id)
      .maybeSingle(),
    supabase.from('submissions').select('*').eq('battle_id', id).order('round_number'),
    supabase.from('votes').select('*, voter:profiles!votes_voter_id_fkey(username)').eq('battle_id', id).order('created_at'),
    supabase.auth.getUser(),
    supabase.from('battle_invites').select('token').eq('battle_id', id).maybeSingle(),
    supabase.from('battle_judges').select('judge_id, is_reserve, active, judge:profiles!battle_judges_judge_id_fkey(username)').eq('battle_id', id).order('created_at'),
    supabase.from('judge_votes').select('judge_id, voted_for').eq('battle_id', id),
  ]);

  if (!battle) notFound();

  return (
    <BattleView
      battle={battle as BattleWithPlayers}
      submissions={(submissions ?? []) as Submission[]}
      initialVotes={(votes ?? []) as Vote[]}
      currentUserId={auth.user?.id ?? null}
      inviteToken={t ?? null}
      shareToken={invite?.token ?? null}
      judges={(judges ?? []) as unknown as BattleJudge[]}
      judgeVotes={(judgeVotes ?? []) as JudgeVote[]}
    />
  );
}
