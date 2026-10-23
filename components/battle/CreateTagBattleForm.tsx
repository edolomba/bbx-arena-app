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
  const [mode, setMode] = useState<'async' | 'live' | 'stage'>('async');
  const [responseHours, setResponseHours] = useState(24);
  const [startsIn, setStartsIn] = useState(60);
  const [host, setHost] = useState('');
  const [judgeList, setJudgeList] = useState('');
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
      const sides = {
        p_team: mine === 'team' ? team || null : null,
        p_partner: mine === 'casual' ? partner || null : null,
        p_opponent_team: against === 'team' ? oppTeam || null : null,
      };
      const judges = judgeList.split(/[\s,]+/).map((j) => j.replace(/^@/, '')).filter(Boolean);
      const id = mode === 'async'
        ? await rpcOrThrow(supabase, 'create_tag_battle', { ...sides, p_round_duration: duration, p_rounds: rounds, p_voting_hours: voting, p_ranked: ranked, p_response_hours: responseHours })
        : await rpcOrThrow(supabase, 'create_tag_battle_live', {
            ...sides, p_mode: mode, p_starts_in_minutes: startsIn, p_round_duration: duration,
            p_rounds: mode === 'live' ? 1 : rounds, p_voting_hours: voting,
            p_host_username: mode === 'stage' ? host || null : null,
            p_judges: mode === 'stage' && judges.length ? judges : null,
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
      <fieldset className="grid gap-3">
        <legend className="mb-2 font-semibold">{t.format}</legend>
        <div className="flex flex-wrap gap-2">
          {(['async', 'live', 'stage'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={pill(mode === m)}>
              {m === 'async' ? all.create.asyncTitle : m === 'live' ? all.create.liveTitle : all.create.stageTitle}
            </button>
          ))}
        </div>
        <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">{mode === 'stage' ? t.stageNote : mode === 'live' ? t.liveNote : t.onlyTurns}</p>
      </fieldset>

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
      {mode === 'async' && (
        <label className="grid gap-1 text-sm"><span className="text-muted">{all.create.responseTime}</span>
          <select value={responseHours} onChange={(e) => setResponseHours(Number(e.target.value))} className={field}>
            {[1, 3, 12, 24].map((h) => <option key={h} value={h}>{all.create.hoursShort(h)}</option>)}
          </select>
          <span className="text-xs text-muted">{all.create.asyncNoteH(responseHours)}</span></label>
      )}
      {mode !== 'async' && (
        <label className="grid gap-1 text-sm"><span className="text-muted">{all.create.starts}</span>
          <select value={startsIn} onChange={(e) => setStartsIn(Number(e.target.value))} className={field}>
            {[[15, all.create.in15], [60, all.create.in60], [360, all.create.in360], [1440, all.create.in1440]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></label>
      )}
      {mode === 'stage' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm"><span className="text-muted">{all.create.host}</span>
            <input value={host} onChange={(e) => setHost(e.target.value)} placeholder={t.hostPh} className={field} autoCapitalize="none" autoCorrect="off" /></label>
          <label className="grid gap-1 text-sm"><span className="text-muted">{all.create.judges}</span>
            <input value={judgeList} onChange={(e) => setJudgeList(e.target.value)} placeholder={t.judgesPh} className={field} autoCapitalize="none" autoCorrect="off" /></label>
          <p className="text-xs text-muted sm:col-span-2">{all.create.iHostNote}</p>
        </div>
      )}
      {mode === 'async' && <label className="flex items-center gap-3">
        <input type="checkbox" checked={ranked} onChange={(e) => setRanked(e.target.checked)} className="size-4 accent-[var(--gold)]" />
        <span>Ranked</span>
      </label>}

      {error && <p role="alert" className="text-loss">{error}</p>}
      <button disabled={busy || (against === 'team' && !oppTeam) || (mine === 'team' && !team)} className="justify-self-start rounded-full bg-ink px-6 py-3 text-paper disabled:opacity-60">
        {busy ? t.creating : t.create}
      </button>
    </form>
  );
}
