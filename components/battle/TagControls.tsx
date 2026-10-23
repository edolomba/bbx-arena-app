'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';
import Avatar from '@/components/Avatar';
import { rpcOrThrow } from '@/lib/supabase/tag';
import type { BattleWithPlayers, ProfileSummary } from '@/lib/types';

type Side = 'challenger' | 'opponent';

/** One side of a Tag Team battle in the face-off: team name (or "a & b"), both members, open seats. */
export function TagSide({ battle, side, viewerId, align }: { battle: BattleWithPlayers; side: Side; viewerId: string | null; align: 'start' | 'end' }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const t = useI18n().t.tag;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const captain = side === 'challenger' ? battle.challenger : battle.opponent;
  const partner = side === 'challenger' ? battle.challenger_partner : battle.opponent_partner;
  const team = side === 'challenger' ? battle.challenger_team : battle.opponent_team;
  const captainId = side === 'challenger' ? battle.challenger_id : battle.opponent_id;
  const won = battle.status === 'finished' && !!battle.winner_id && battle.winner_id === captainId;
  const lost = battle.status === 'finished' && !!battle.winner_id && battle.winner_id !== captainId;
  const seated = [battle.challenger_id, battle.challenger_partner_id, battle.opponent_id, battle.opponent_partner_id].includes(viewerId ?? '');
  const seatOpen = !!captain && !partner && !team && (battle.status === 'open' || battle.status === 'pending');

  async function join() {
    setBusy(true);
    setError('');
    try { await rpcOrThrow(supabase, 'join_tag_seat', { p_battle: battle.id, p_side: side }); router.refresh(); }
    catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  const person = (p: ProfileSummary | null | undefined) => p ? (
    <Link key={p.id} href={`/beatboxers/${p.username}`} className="flex items-center gap-2 hover:underline">
      <Avatar username={p.username} url={p.avatar_url} size="md" ring={won ? 'gold' : 'muted'} />
      <span className="font-semibold">{p.username}</span>
    </Link>
  ) : null;

  return (
    <div className={`grid min-w-0 justify-items-center gap-3 text-center ${align === 'end' ? 'md:justify-items-end md:text-right' : 'md:justify-items-start md:text-left'} ${lost ? 'opacity-55' : ''}`}>
      {won && <span className="text-2xl" aria-hidden="true">👑</span>}
      <h2 className="handle text-[clamp(1.5rem,4vw,2.6rem)] leading-none break-words">
        {team ? <Link href={`/teams/${team.id}`} className="hover:underline">{team.name}</Link>
          : captain ? `${captain.username}${partner ? ` & ${partner.username}` : ''}` : <span className="text-muted">{t.openSeat}</span>}
      </h2>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {person(captain)}
        {person(partner)}
        {seatOpen && (
          viewerId && !seated ? (
            <button onClick={join} disabled={busy} className="rounded-full border border-gold/60 px-4 py-2 text-sm text-gold disabled:opacity-60">+ {t.joinSeat}</button>
          ) : <span className="rounded-full border border-dashed border-line px-4 py-2 text-sm text-muted">{t.openSeat}</span>
        )}
      </div>
      <span className="font-mono text-[0.65rem] tracking-widest text-muted uppercase">{t.chip}</span>
      {error && <p role="alert" className="text-sm text-loss">{error}</p>}
    </div>
  );
}

/** Accepting a Tag Team battle: with one of my fixed teams, or as a casual duo. */
export function TagAccept({ battle, viewerId }: { battle: BattleWithPlayers; viewerId: string | null }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const t = useI18n().t.tag;
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [team, setTeam] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const seated = [battle.challenger_id, battle.challenger_partner_id, battle.opponent_id, battle.opponent_partner_id].includes(viewerId ?? '');
  const openToMe = battle.status === 'open' && !battle.opponent_id && !!viewerId && !seated;
  const invitedTeam = battle.status === 'pending' && !battle.tag_accepted && !!viewerId && [battle.opponent_id, battle.opponent_partner_id].includes(viewerId);

  useEffect(() => {
    if (!openToMe || !viewerId) return;
    void supabase.from('team_members').select('team:teams!inner(id, name, status)').eq('profile_id', viewerId).eq('status', 'active')
      .then(({ data }) => setTeams(((data ?? []) as unknown as { team: { id: string; name: string; status: string } }[]).filter((r) => r.team.status === 'active').map((r) => r.team)));
  }, [openToMe, viewerId, supabase]);

  if (!openToMe && !invitedTeam) return null;
  async function accept(p_team: string | null) {
    setBusy(true);
    setError('');
    try { await rpcOrThrow(supabase, 'accept_tag_battle', { p_battle: battle.id, p_team }); router.refresh(); }
    catch (e) { setError((e as Error).message); }
    setBusy(false);
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      {invitedTeam ? (
        <button onClick={() => accept(null)} disabled={busy} className="rounded-full bg-ink px-6 py-3 text-paper disabled:opacity-60">{t.accept}</button>
      ) : (
        <>
          {teams.length > 0 && (
            <span className="flex flex-wrap items-center gap-2">
              <select value={team} onChange={(e) => setTeam(e.target.value)} className="rounded-full border border-line bg-surface px-4 py-3">
                <option value="">{t.pickTeam}</option>
                {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
              </select>
              <button onClick={() => accept(team)} disabled={busy || !team} className="rounded-full bg-ink px-6 py-3 text-paper disabled:opacity-60">{t.acceptWith}</button>
            </span>
          )}
          <button onClick={() => accept(null)} disabled={busy} className="rounded-full border border-line px-6 py-3">{t.acceptCasual}</button>
          {teams.length === 0 && <Link href="/teams" className="text-sm text-muted underline underline-offset-4">{t.noTeams} {t.createTeam}</Link>}
        </>
      )}
      {error && <p role="alert" className="w-full text-loss">{error}</p>}
    </div>
  );
}
