'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { rpcOrThrow } from '@/lib/supabase/tag';

type Team = { id: string; name: string };

/** Tag Team 2v2 (take turns): my side (fixed team or casual duo) against a Tag Team or an open challenge. */
export default function CreateTagBattleForm({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { t: all } = useI18n();
  const t = all.tag;
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [mine, setMine] = useState<'team' | 'casual'>('casual');
  const [team, setTeam] = useState('');
  const [partner, setPartner] = useState('');
  const [against, setAgainst] = useState<'open' | 'team'>('open');
  const [oppTeam, setOppTeam] = useState('');
  const [duration, setDuration] = useState(60);
  const [rounds, setRounds] = useState(1);
  const [voting, setVoting] = useState(24);
  const [ranked, setRanked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void supabase.from('team_members').select('team:teams!inner(id, name, status)').eq('profile_id', userId).eq('status', 'active')
      .then(({ data }) => {
        const list = ((data ?? []) as unknown as { team: Team & { status: string } }[]).filter((r) => r.team.status === 'active').map((r) => ({ id: r.team.id, name: r.team.name }));
        setMyTeams(list);
        if (list.length) { setMine('team'); setTeam(list[0].id); }
      });
    void supabase.from('teams').select('id, name').eq('status', 'active').order('name').limit(500)
      .then(({ data }) => setAllTeams((data ?? []) as Team[]));
  }, [supabase, userId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const id = await rpcOrThrow(supabase, 'create_tag_battle', {
        p_team: mine === 'team' ? team || null : null,
        p_partner: mine === 'casual' ? partner || null : null,
        p_opponent_team: against === 'team' ? oppTeam || null : null,
        p_round_duration: duration, p_rounds: rounds, p_voting_hours: voting, p_ranked: ranked,
      });
      router.push(`/battles/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const pill = (on: boolean) => `rounded-full border px-4 py-2 ${on ? 'border-gold bg-gold/15 text-gold' : 'border-line text-muted hover:text-ink'}`;
  const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2.5';
  const myTeamIds = new Set(myTeams.map((m) => m.id));

  return (
    <form onSubmit={submit} className="grid max-w-2xl gap-7">
      <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">{t.onlyTurns}</p>

      <fieldset className="grid gap-3">
        <legend className="mb-2 font-semibold">{t.mySide}</legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!myTeams.length} onClick={() => setMine('team')} className={`${pill(mine === 'team')} disabled:opacity-40`}>{t.myTeam}</button>
          <button type="button" onClick={() => setMine('casual')} className={pill(mine === 'casual')}>{t.casual}</button>
        </div>
        {mine === 'team' ? (
          <select value={team} onChange={(e) => setTeam(e.target.value)} className={field}>
            {myTeams.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        ) : (
          <label className="grid gap-1 text-sm"><span className="text-muted">{t.partner}</span>
            <input value={partner} onChange={(e) => setPartner(e.target.value)} placeholder={t.partnerPh} className={field} autoCapitalize="none" autoCorrect="off" /></label>
        )}
        {!myTeams.length && <p className="text-sm text-muted">{t.noTeams} <Link href="/teams" className="underline underline-offset-4">{t.createTeam}</Link></p>}
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-2 font-semibold">{t.opponentSide}</legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setAgainst('open')} className={pill(against === 'open')}>{t.openChallenge}</button>
          <button type="button" onClick={() => setAgainst('team')} className={pill(against === 'team')}>{t.againstTeam}</button>
        </div>
        {against === 'team' && (
          <select required value={oppTeam} onChange={(e) => setOppTeam(e.target.value)} className={field}>
            <option value="">{t.pickTeam}</option>
            {allTeams.filter((x) => !myTeamIds.has(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="grid gap-1 text-sm"><span className="text-muted">{all.create.roundLength}</span>
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={field}>
            {[30, 45, 60, 90].map((s) => <option key={s} value={s}>{all.create.seconds(s)}</option>)}
          </select></label>
        <label className="grid gap-1 text-sm"><span className="text-muted">{all.create.roundsEach}</span>
          <select value={rounds} onChange={(e) => setRounds(Number(e.target.value))} className={field}>
            {[1, 2].map((n) => <option key={n} value={n}>{all.create.rounds(n)}</option>)}
          </select></label>
        <label className="grid gap-1 text-sm"><span className="text-muted">{all.create.votingOpen}</span>
          <select value={voting} onChange={(e) => setVoting(Number(e.target.value))} className={field}>
            {[1, 12, 24].map((h) => <option key={h} value={h}>{h} h</option>)}
          </select></label>
      </div>
      <label className="flex items-center gap-3">
        <input type="checkbox" checked={ranked} onChange={(e) => setRanked(e.target.checked)} className="size-4 accent-[var(--gold)]" />
        <span>Ranked</span>
      </label>

      {error && <p role="alert" className="text-loss">{error}</p>}
      <button disabled={busy || (against === 'team' && !oppTeam) || (mine === 'team' && !team)} className="justify-self-start rounded-full bg-ink px-6 py-3 text-paper disabled:opacity-60">
        {busy ? t.creating : t.create}
      </button>
    </form>
  );
}
