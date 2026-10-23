'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { audioUrl } from '@/lib/supabase/storage';
import { submitTake } from '@/lib/supabase/battles';
import { submitTagPart } from '@/lib/supabase/tag';
import AudioRecorder from '@/components/audio/AudioRecorder';
import OverdubRecorder from './OverdubRecorder';
import type { BattleWithPlayers, PreparedTake, TagPart } from '@/lib/types';

/** What a Tag Team member sees on their team's turn: record the first part, wait, or record over the partner's part. */
export default function TagRoundPanel({ battle, userId }: { battle: BattleWithPlayers; userId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const t = useI18n().t.tag;
  const captain = [battle.challenger_id, battle.challenger_partner_id].includes(userId) ? battle.challenger_id : battle.opponent_id!;
  const partnerName = captain === battle.challenger_id
    ? [battle.challenger, battle.challenger_partner].find((p) => p && p.id !== userId)?.username
    : [battle.opponent, battle.opponent_partner].find((p) => p && p.id !== userId)?.username;
  const live = battle.mode === 'live';
  const round = live ? 1 : Math.floor(battle.turn_number / 2) + 1;
  const [teamDone, setTeamDone] = useState(false);
  const [part, setPart] = useState<TagPart | null | undefined>(undefined);
  const [redo, setRedo] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('tag_parts').select('*').eq('battle_id', battle.id).eq('side_captain', captain).eq('round_number', round).maybeSingle();
    setPart((data as TagPart) ?? null);
    if (live) {
      const { count } = await supabase.from('submissions').select('id', { count: 'exact', head: true }).eq('battle_id', battle.id).eq('user_id', captain);
      setTeamDone((count ?? 0) > 0);
    }
  }, [supabase, battle.id, captain, round, live]);
  useEffect(() => { void load(); }, [load]);
  // the partner may record while this page is open
  useEffect(() => {
    const ch = supabase.channel(`tag-parts-${battle.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tag_parts', filter: `battle_id=eq.${battle.id}` }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [supabase, battle.id, load]);

  if (!live && battle.current_turn_user_id !== captain) return <p className="text-muted">{t.otherTeamTurn}</p>;
  if (live && battle.starts_at && Date.now() >= new Date(battle.starts_at).getTime()) return null;
  if (teamDone) return <p className="rounded-2xl border border-win/40 bg-win/5 p-4 text-win">{t.teamRoundIn}</p>;
  if (part === undefined) return null;

  async function sendPart(take: PreparedTake) {
    await submitTagPart(supabase, battle.id, userId, take);
    setRedo(false);
    await load();
  }
  async function sendMix(take: PreparedTake) {
    await submitTake(supabase, battle.id, userId, take);
    if (live) setTeamDone(true);
    router.refresh();
  }

  if (!part || (redo && part.profile_id === userId)) {
    return (
      <section className="grid gap-3 rounded-2xl border border-gold/30 bg-gold/5 p-5">
        <h3 className="text-lg font-bold">{t.recordFirst}</h3>
        <p className="text-muted">{t.firstHint}</p>
        <AudioRecorder maxSeconds={battle.round_duration_seconds} onSubmit={sendPart} submitLabel={t.recordFirst} />
      </section>
    );
  }
  if (part.profile_id === userId) {
    return (
      <section className="grid gap-3 rounded-2xl border border-win/40 bg-win/5 p-5">
        <p className="text-win">{t.partInByMe}</p>
        <button onClick={() => setRedo(true)} className="justify-self-start text-sm underline underline-offset-4">{t.redoPart}</button>
      </section>
    );
  }
  return (
    <section className="grid gap-3">
      <p className="font-semibold">{t.partInByPartner(partnerName ?? '')}</p>
      <OverdubRecorder partUrl={audioUrl(part.audio_path)} maxSeconds={battle.round_duration_seconds} onSubmit={sendMix} />
    </section>
  );
}
