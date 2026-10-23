'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { acceptChallenge, advanceBattle, castVote, declineChallenge, submitTake } from '@/lib/supabase/battles';
import { audioUrl } from '@/lib/supabase/storage';
import WaveformPlayer from '@/components/audio/WaveformPlayer';
import AudioRecorder from '@/components/audio/AudioRecorder';
import Countdown from '@/components/Countdown';
import LiveRoom from './LiveRoom';
import StageRoom from './StageRoom';
import ReportButton from '@/components/moderation/ReportButton';
import BadgeChip from '@/components/badges/BadgeChip';
import Avatar from '@/components/Avatar';
import { TagAccept, TagSide } from './TagControls';
import TagRoundPanel from './TagRoundPanel';
import { useI18n } from '@/components/i18n/I18nProvider';
import { flagEmoji, intervalHours, signed } from '@/lib/format';
import type { BattleJudge, BattleWithPlayers, JudgeVote, PreparedTake, ProfileSummary, Submission, Vote } from '@/lib/types';

interface Props {
  battle: BattleWithPlayers;
  submissions: Submission[];
  initialVotes: Vote[];
  currentUserId: string | null;
  /** From ?t= on an invite link, for unlisted open challenges. */
  inviteToken?: string | null;
  /** The challenger's own invite token, to show a shareable link. */
  shareToken?: string | null;
  judges?: BattleJudge[];
  judgeVotes?: JudgeVote[];
}

/** Fraction of each round a voter must actually hear before voting unlocks. */
const LISTEN_TO_VOTE = 0.5;

function PlayerHeader({ p, align, isWinner, isLoser, eloDelta }: {
  p: ProfileSummary | null; align: 'start' | 'end'; isWinner: boolean; isLoser: boolean; eloDelta: number | null;
}) {
  const tb = useI18n().t.battle;
  return (
    <div className={`grid min-w-0 justify-items-center gap-2 text-center transition-opacity ${align === 'end' ? 'md:justify-items-end md:text-right' : 'md:justify-items-start md:text-left'} ${isLoser ? 'opacity-55' : ''}`}>
      <span className="relative">
        {isWinner && <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-2xl" aria-hidden="true">👑</span>}
        {p ? <Avatar username={p.username} url={p.avatar_url} size="podium" ring={isWinner ? 'gold' : 'muted'} />
           : <span className="grid size-16 place-items-center rounded-full border-2 border-dashed border-line text-2xl text-muted sm:size-28 sm:text-4xl" aria-hidden="true">?</span>}
      </span>
      <h2 className="handle text-[clamp(1.6rem,4.5vw,3rem)] leading-none break-all">
        {p ? (
          <Link href={`/beatboxers/${p.username}`} className="underline-offset-4 hover:underline">{p.username}</Link>
        ) : (
          <span className="text-muted">{tb.openSlot}</span>
        )}
      </h2>
      {p && (
        <p className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-muted ${align === 'end' ? 'md:justify-end' : 'md:justify-start'}`}>
          <span aria-hidden="true">{flagEmoji(p.country)}</span>
          <span><span className="num text-ink">{p.elo_rating}</span> {tb.rating}</span>
          {eloDelta != null && <span className={`num ${eloDelta >= 0 ? 'text-win' : 'text-loss'}`}>{signed(eloDelta)}</span>}
          {p.featured_badge && <BadgeChip code={p.featured_badge} compact />}
          {isWinner && <span className="rounded-full bg-gold px-2 py-0.5 text-sm font-semibold text-paper">{tb.winner}</span>}
        </p>
      )}
    </div>
  );
}

export default function BattleView({ battle, submissions, initialVotes, currentUserId, inviteToken, shareToken, judges = [], judgeVotes = [] }: Props) {
  const tb = useI18n().t.battle;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [votes, setVotes] = useState<Vote[]>(initialVotes);
  const [listened, setListened] = useState<Record<string, number>>({});
  const [matchLoudness, setMatchLoudness] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => setVotes(initialVotes), [initialVotes]);
  useEffect(() => setOrigin(window.location.origin), []);

  // Live updates: votes stream in; turn changes and new rounds refresh server data.
  useEffect(() => {
    const channel = supabase
      .channel(`battle:${battle.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes', filter: `battle_id=eq.${battle.id}` },
        (payload) => setVotes((v) => (v.some((x) => x.id === payload.new.id) ? v : [...v, payload.new as Vote])))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'battles', filter: `id=eq.${battle.id}` },
        () => router.refresh())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'submissions', filter: `battle_id=eq.${battle.id}` },
        () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'battle_judges', filter: `battle_id=eq.${battle.id}` },
        () => router.refresh())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, battle.id, router]);

  // Move the battle on the moment a deadline passes, instead of waiting for the cron job.
  useEffect(() => {
    const due: (string | null)[] = [];
    if (battle.status === 'open' || battle.status === 'pending') due.push(battle.turn_deadline);
    if (battle.status === 'active') due.push(battle.mode !== 'async' ? battle.starts_at : battle.turn_deadline);
    if (battle.status === 'live') due.push(battle.live_ends_at);
    if (battle.status === 'voting') due.push(battle.voting_ends_at);
    const next = due.filter(Boolean).map((d) => new Date(d!).getTime()).sort((a, b) => a - b)[0];
    if (!next) return;
    const wait = Math.max(0, next - Date.now()) + 400;
    if (wait > 2 ** 31 - 1) return;
    const t = window.setTimeout(async () => {
      await advanceBattle(supabase, battle.id);
      router.refresh();
    }, wait);
    return () => window.clearTimeout(t);
  }, [battle, supabase, router]);

  const { challenger, opponent } = battle;
  const sides = [
    { id: battle.challenger_id, profile: challenger as ProfileSummary | null },
    { id: battle.opponent_id, profile: opponent },
  ];
  const isLive = battle.mode === 'live';
  const isStage = battle.mode === 'stage';
  const judged = isStage && (battle.judge_count ?? 0) > 0;
  const scheduled = isLive || isStage;
  const votingHours = intervalHours(battle.voting_window);
  const isParticipant = currentUserId != null && (currentUserId === battle.challenger_id || currentUserId === battle.opponent_id
    || (battle.format === 'tag' && (currentUserId === battle.challenger_partner_id || currentUserId === battle.opponent_partner_id)));
  const myVote = votes.find((v) => v.voter_id === currentUserId) ?? null;
  const tally = sides.map((s) => votes.filter((v) => v.voted_for_user_id === s.id).length);
  const totalVotes = tally[0] + tally[1];
  const showTally = battle.status === 'finished' || myVote !== null || isParticipant;
  const nameOf = (id: string | null) => sides.find((s) => s.id === id)?.profile?.username ?? 'someone';

  const addHeard = useCallback((id: string, fraction: number) => {
    setListened((prev) => ({ ...prev, [id]: Math.min(1, (prev[id] ?? 0) + fraction) }));
  }, []);
  const setHeard = useCallback((id: string, fraction: number) => {
    setListened((prev) => (fraction > (prev[id] ?? 0) ? { ...prev, [id]: fraction } : prev));
  }, []);

  // Attenuate-only level match: everyone is brought down to the quietest take.
  const loudnessTarget = useMemo(() => {
    const values = submissions.map((s) => s.integrated_lufs).filter((x): x is number => x != null);
    return values.length > 1 ? Math.min(...values) : null;
  }, [submissions]);
  const gainFor = (s: Submission) =>
    matchLoudness && loudnessTarget != null && s.integrated_lufs != null ? loudnessTarget - s.integrated_lufs : 0;

  // Stage battles also count what was heard live, keyed by battler and round.
  const heardOf = (s: Submission) => Math.max(listened[s.id] ?? 0, listened[`u:${s.user_id}:${s.round_number}`] ?? 0);
  const heardAll = submissions.length > 0 && submissions.every((s) => heardOf(s) >= LISTEN_TO_VOTE);
  const expectedRound = Math.floor(battle.turn_number / 2) + 1;

  const statusLine = (() => {
    switch (battle.status) {
      case 'open':
        return <>{tb.stOpen} <Countdown to={battle.turn_deadline!} />.</>;
      case 'pending':
        return scheduled
          ? <>{tb.stPendingStarts(nameOf(battle.opponent_id))} <Countdown to={battle.starts_at!} />.</>
          : <>{tb.stPending(nameOf(battle.opponent_id))} <Countdown to={battle.turn_deadline!} />.</>;
      case 'active':
        if (isStage) return <>{tb.stStageOpens} <Countdown to={battle.starts_at!} />.</>;
        if (isLive) return <>{tb.stLiveLocking} <Countdown to={battle.starts_at!} />.</>;
        return battle.current_turn_user_id === currentUserId
          ? <>{tb.stYourTurn} <Countdown to={battle.turn_deadline!} /> {tb.stLeft}</>
          : <>{tb.stUp(nameOf(battle.current_turn_user_id))} <Countdown to={battle.turn_deadline!} /> {tb.stLeft}</>;
      case 'live':
        return <>{tb.stLiveNow}</>;
      case 'voting':
        return <>{tb.stVotingCloses} <Countdown to={battle.voting_ends_at!} />.</>;
      case 'finished':
        if (battle.result === 'forfeit')
          return scheduled
            ? <>{tb.stForfeitScheduled(nameOf(battle.winner_id), nameOf(battle.forfeited_by))}</>
            : <>{tb.stForfeit(nameOf(battle.winner_id), nameOf(battle.forfeited_by))}</>;
        if (battle.result === 'draw') return <>{tb.stDraw(tally[0])}</>;
        if (battle.result === 'no_contest') return <>{tb.stNoContest}</>;
        if (judged) {
          const jw = judgeVotes.filter((v) => v.voted_for === battle.winner_id).length;
          return <>{tb.stJudges(nameOf(battle.winner_id), judgeVotes.length ? `, ${jw}–${judgeVotes.length - jw}` : '')}</>;
        }
        return <>{tb.stWins(nameOf(battle.winner_id), Math.max(...tally), Math.min(...tally))}</>;
      case 'cancelled':
        return <>{tb.stExpired}</>;
    }
  })();

  const details = `${isStage ? `${tb.dStage}${battle.host ? tb.dHostedBy(battle.host.username) : ''}. ` : isLive ? tb.dLive : ''}${tb.dRounds(battle.rounds_per_player)}, ${tb.dSeconds(battle.round_duration_seconds)}${judged ? `, ${tb.dJudges(battle.judge_count ?? 0)}` : `, ${tb.dVoting(tb.hours(votingHours))}${scheduled ? tb.dAfterLast : ''}`}${battle.ranked ? '' : `. ${tb.dCasual}`}`;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : tb.errGeneric);
    } finally {
      setBusy(false);
    }
  }

  const handleSubmit = useCallback(async (take: PreparedTake) => {
    if (!currentUserId) throw new Error(tb.errLogin);
    await submitTake(supabase, battle.id, currentUserId, take);
    router.refresh();
  }, [supabase, battle.id, currentUserId, router]);

  const vote = (userId: string) => run(async () => {
    const v = await castVote(supabase, battle.id, userId);
    setVotes((prev) => (prev.some((x) => x.id === v.id) ? prev : [...prev, v]));
  });

  const isTag = battle.format === 'tag';
  const tagSeated = isTag && !!currentUserId && [battle.challenger_partner_id, battle.opponent_partner_id].includes(currentUserId);
  const canAccept = !isTag && currentUserId != null && currentUserId !== battle.challenger_id &&
    (battle.status === 'open' || (battle.status === 'pending' && battle.opponent_id === currentUserId));
  const canDecline = (isTag ? currentUserId != null && [battle.challenger_id, battle.opponent_id].includes(currentUserId) : isParticipant)
    && (battle.status === 'open' || battle.status === 'pending');
  const showLiveRoom = isLive && (battle.status === 'active' || battle.status === 'live');
  const showStage = isStage && (battle.status === 'active' || battle.status === 'live');
  const inviteUrl = shareToken && origin ? `${origin}/battles/${battle.id}?t=${shareToken}` : null;

  return (
    <article className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6">
      <header className="grid gap-6">
        <div className="relative grid items-center gap-4 overflow-hidden rounded-3xl border border-line bg-surface px-5 pt-9 pb-7 sm:gap-6 sm:px-10 sm:pt-10 sm:pb-8 md:grid-cols-[1fr_auto_1fr]">
          <span className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-gold/12 to-transparent" aria-hidden="true" />
          <span className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-sub/12 to-transparent" aria-hidden="true" />
          <div className="relative">
            {isTag ? <TagSide battle={battle} side="challenger" viewerId={currentUserId} align="start" /> : <PlayerHeader p={challenger} align="start" isWinner={battle.winner_id === battle.challenger_id}
              isLoser={battle.status === 'finished' && !!battle.winner_id && battle.winner_id !== battle.challenger_id}
              eloDelta={battle.status === 'finished' ? battle.challenger_elo_delta : null} />}
          </div>
          <span className="handle relative justify-self-center bg-gradient-to-b from-gold to-sub bg-clip-text text-[clamp(3rem,9vw,6rem)] leading-none text-transparent italic" aria-hidden="true">VS</span>
          <div className="relative">
            {isTag ? <TagSide battle={battle} side="opponent" viewerId={currentUserId} align="end" /> : <PlayerHeader p={opponent} align="end" isWinner={battle.opponent_id != null && battle.winner_id === battle.opponent_id}
              isLoser={battle.status === 'finished' && !!battle.winner_id && battle.opponent_id != null && battle.winner_id !== battle.opponent_id}
              eloDelta={battle.status === 'finished' ? battle.opponent_elo_delta : null} />}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-y border-line py-3">
          <p className="num text-lg" role="status">{statusLine}</p>
          <p className="text-sm text-muted">{details}</p>
        </div>

        {isTag && <TagAccept battle={battle} viewerId={currentUserId} />}
        {isTag && battle.status === 'active' && currentUserId && ([battle.challenger_id, battle.opponent_id].includes(currentUserId) || tagSeated) && (
          <TagRoundPanel battle={battle} userId={currentUserId} />
        )}
        {(canAccept || canDecline || (inviteUrl && (battle.status === 'open' || battle.status === 'pending'))) && (
          <div className="flex flex-wrap items-center gap-3">
            {canAccept && (
              <button onClick={() => run(async () => { await acceptChallenge(supabase, battle.id, inviteToken); router.refresh(); })}
                disabled={busy} className="rounded-full bg-ink px-6 py-3 text-paper disabled:opacity-60">
                {battle.status === 'open' ? tb.take : tb.accept}
              </button>
            )}
            {canDecline && (
              <button onClick={() => run(async () => { await declineChallenge(supabase, battle.id); router.refresh(); })}
                disabled={busy} className="rounded-full border border-line px-6 py-3">
                {currentUserId === battle.challenger_id ? tb.cancel : tb.decline}
              </button>
            )}
            {inviteUrl && currentUserId === battle.challenger_id && (
              <button onClick={() => navigator.clipboard.writeText(inviteUrl)} className="rounded-full border border-line px-6 py-3">
                {tb.copyInvite}
              </button>
            )}
          </div>
        )}
        {battle.mode === 'async' && (battle.status === 'open' || battle.status === 'pending') && currentUserId === battle.challenger_id && (
          battle.turn_number >= 1 ? (
            <p className="rounded-2xl border border-win/40 bg-win/10 p-4 text-win">{tb.preDone}</p>
          ) : (
            <section className="grid gap-3 rounded-2xl border border-gold/30 bg-gold/5 p-5">
              <h2 className="text-xl font-bold [font-stretch:112%]">{tb.preTitle}</h2>
              <p className="max-w-[62ch] text-muted">{tb.preHint}</p>
              <AudioRecorder maxSeconds={battle.round_duration_seconds} onSubmit={handleSubmit} submitLabel={tb.preSubmit} />
            </section>
          )
        )}
        {!currentUserId && (battle.status === 'open' || battle.status === 'pending') && (
          <p><Link href={`/login?next=/battles/${battle.id}`} className="underline underline-offset-4">{tb.logIn}</Link> {tb.toTake}</p>
        )}
      </header>

      {showStage ? (
        <StageRoom battle={battle} judges={judges} votes={votes} currentUserId={currentUserId} onHeard={addHeard} />
      ) : showLiveRoom ? (
        <LiveRoom battle={battle} submissions={submissions} currentUserId={currentUserId} onHeard={addHeard} />
      ) : (
        <>
          {submissions.length > 1 && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={matchLoudness} onChange={(e) => setMatchLoudness(e.target.checked)} className="size-4 accent-[var(--signal)]" />
                {tb.matchLoudness}
              </label>
              <span className="max-w-prose text-muted">{tb.matchLoudnessHint}</span>
              <span className="flex items-center gap-2 text-muted">
                <span className="inline-block h-3 w-1 rounded-sm bg-sub" aria-hidden="true" />
                {tb.subLegend}
              </span>
              {isLive && <span className="text-muted">{tb.liveReplays}</span>}
              {isStage && <span className="text-muted">{tb.stageReplays}</span>}
            </div>
          )}

          {battle.status !== 'cancelled' && battle.status !== 'open' && battle.status !== 'pending' && (
            <div className="grid gap-10">
              {Array.from({ length: battle.rounds_per_player }, (_, i) => i + 1).map((round) => (
                <section key={round} aria-labelledby={`round-${round}`} className="grid gap-4">
                  <h3 id={`round-${round}`} className="text-sm text-muted">{tb.round(round)}</h3>
                  <div className="grid gap-6 md:grid-cols-2 md:gap-10">
                    {sides.map((side, idx) => {
                      const sub = submissions.find((s) => s.user_id === side.id && s.round_number === round);
                      const isTurn = !scheduled && battle.status === 'active' && battle.current_turn_user_id === side.id && round === expectedRound;
                      const who = side.profile ? `@${side.profile.username}` : tb.openSlot;
                      if (sub) {
                        const heard = heardOf(sub);
                        return (
                          <div key={idx} className="grid gap-2">
                            <p className="text-sm">{who}{!sub.is_lossless && <span className="ml-2 text-muted">{tb.compressedUpload}</span>}</p>
                            <WaveformPlayer src={audioUrl(sub.stream_path ?? sub.audio_path)} waveform={sub.waveform_data}
                              durationMs={sub.duration_ms} gainDb={gainFor(sub)} label={`${who} round ${round}`}
                              onListenProgress={(f) => setHeard(sub.id, f)} />
                            {battle.status === 'voting' && !isParticipant && !myVote && (
                              <p className="text-sm text-muted">{heard >= LISTEN_TO_VOTE ? tb.heard : tb.heardPct(Math.round(heard * 100))}</p>
                            )}
                          </div>
                        );
                      }
                      if (isTurn && side.id === currentUserId && !isTag) {
                        return (
                          <div key={idx} className="grid gap-3 md:col-span-2">
                            <p>{tb.yourRound(round)} <Countdown to={battle.turn_deadline!} /> {tb.toSubmit}</p>
                            <AudioRecorder maxSeconds={battle.round_duration_seconds} onSubmit={handleSubmit} submitLabel={tb.submitRound(round)} />
                          </div>
                        );
                      }
                      return (
                        <div key={idx} className="grid min-h-28 place-items-center rounded-xl border border-dashed border-line p-4 text-center text-muted">
                          {isTurn ? <span>{tb.waitingFor(who)} <Countdown to={battle.turn_deadline!} /> {tb.left}</span>
                            : isStage ? tb.noReplayYet : battle.status === 'finished' ? tb.notRecorded : tb.notYet(who)}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {judged && battle.status === 'finished' && (
        <section aria-labelledby="judges-heading" className="grid gap-4 rounded-2xl bg-surface p-5 sm:p-6">
          <h3 id="judges-heading" className="text-xl">{tb.judgesDecision}</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {judges.filter((j) => j.active).map((j) => {
              const v = judgeVotes.find((x) => x.judge_id === j.judge_id);
              return (
                <li key={j.judge_id} className="flex justify-between gap-3 border-b border-line py-2">
                  <span>@{j.judge?.username}{j.is_reserve ? <span className="text-muted"> ({tb.reserve})</span> : null}</span>
                  <span className={v ? (v.voted_for === battle.winner_id ? 'text-win' : '') : 'text-muted'}>
                    {v ? `@${nameOf(v.voted_for)}` : j.is_reserve ? tb.notNeeded : tb.didntVote}
                  </span>
                </li>
              );
            })}
          </ul>
          {judgeVotes.length > 0 && judgeVotes.filter((v) => v.voted_for === battle.winner_id).length * 2 === judgeVotes.length && (
            <p className="text-sm text-muted">{tb.judgesTied}</p>
          )}
          <p className="text-sm text-muted">
            {tb.crowd(challenger.username, tally[0], tally[1], opponent?.username ?? '')}
          </p>
        </section>
      )}

      {!judged && (battle.status === 'voting' || battle.status === 'finished') && battle.opponent_id && battle.result !== 'forfeit' && (
        <section aria-labelledby="vote-heading" className="grid gap-5 rounded-2xl bg-surface p-5 sm:p-6">
          <h3 id="vote-heading" className="text-xl">{battle.status === 'voting' ? tb.whoTookIt : tb.votes}</h3>

          {battle.status === 'voting' && (
            !currentUserId ? (
              <p><Link href={`/login?next=/battles/${battle.id}`} className="underline underline-offset-4">{tb.logInToVote}</Link>. {tb.votesPublic}</p>
            ) : isParticipant ? (
              <p className="text-muted">{tb.ownBattle}</p>
            ) : myVote ? (
              <p>{tb.youVoted(nameOf(myVote.voted_for_user_id))}</p>
            ) : (
              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {sides.map((side) => (
                    <button key={side.id} onClick={() => side.id && vote(side.id)} disabled={!heardAll || busy}
                      className="rounded-xl border-2 border-ink px-5 py-4 text-lg hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:border-line disabled:text-muted disabled:hover:bg-transparent">
                      {tb.voteFor} <span className="handle">@{side.profile?.username}</span>
                    </button>
                  ))}
                </div>
                {!heardAll && <p className="text-sm text-muted">{tb.listenFirst}</p>}
              </div>
            )
          )}

          {showTally ? (
            <div className="grid gap-2">
              <div className="num flex justify-between text-lg">
                <span>{tally[0]}</span>
                <span className="text-sm text-muted">{tb.nVotes(totalVotes)}</span>
                <span>{tally[1]}</span>
              </div>
              <div className="flex h-3 overflow-hidden rounded-full bg-line" role="img"
                aria-label={`${tally[0]} votes for @${challenger.username}, ${tally[1]} for @${opponent?.username}`}>
                <div className="bg-signal" style={{ width: totalVotes ? `${(tally[0] / totalVotes) * 100}%` : '50%' }} />
                <div className="flex-1 bg-sub" />
              </div>
            </div>
          ) : battle.status === 'voting' && (
            <p className="text-sm text-muted">{tb.countsAfter}</p>
          )}

          {battle.status === 'finished' && votes.length > 0 && (
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              {sides.map((side) => {
                const voters = votes.filter((v) => v.voted_for_user_id === side.id);
                return (
                  <div key={side.id}>
                    <p className="mb-1 text-muted">{tb.votedFor(side.profile?.username ?? '')}</p>
                    <p>
                      {voters.length === 0 ? tb.nobody : voters.slice(0, 40).map((v, i) => (
                        <span key={v.id}>
                          {i > 0 && ', '}
                          {v.voter ? <Link href={`/beatboxers/${v.voter.username}`} className="underline-offset-4 hover:underline">@{v.voter.username}</Link> : 'a voter'}
                        </span>
                      ))}
                      {voters.length > 40 && tb.andMore(voters.length - 40)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {error && <p className="text-loss" role="alert">{error}</p>}
      {!isParticipant && (
        <div className="border-t border-line pt-4">
          <ReportButton battleId={battle.id} signedIn={!!currentUserId} label={tb.report} />
        </div>
      )}
    </article>
  );
}
