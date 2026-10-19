import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import BattleView from '@/components/battle/BattleView';
import type { BattleWithPlayers, Submission, Vote } from '@/lib/types';

const PLAYER = 'id, username, full_name, avatar_url, country, elo_rating';

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

  const [{ data: battle }, { data: submissions }, { data: votes }, { data: auth }, { data: invite }] = await Promise.all([
    supabase
      .from('battles')
      .select(`*, challenger:profiles!battles_challenger_id_fkey(${PLAYER}), opponent:profiles!battles_opponent_id_fkey(${PLAYER})`)
      .eq('id', id)
      .maybeSingle(),
    supabase.from('submissions').select('*').eq('battle_id', id).order('round_number'),
    supabase.from('votes').select('*, voter:profiles!votes_voter_id_fkey(username)').eq('battle_id', id).order('created_at'),
    supabase.auth.getUser(),
    supabase.from('battle_invites').select('token').eq('battle_id', id).maybeSingle(),
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
    />
  );
}
