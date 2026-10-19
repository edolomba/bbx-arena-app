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
import { flagEmoji, hoursText, intervalHours, signed } from '@/lib/format';
import type { BattleWithPlayers, PreparedTake, ProfileSummary, Submission, Vote } from '@/lib/types';

interface Props {
  battle: BattleWithPlayers;
  submissions: Submission[];
  initialVotes: Vote[];
  currentUserId: string | null;
  /** From ?t= on an invite link, for unlisted open challenges. */
  inviteToken?: string | null;
  /** The challenger's own invite token, to show a shareable link. */
  shareToken?: string | null;
}

/** Fraction of each round a voter must actually hear before voting unlocks. */
const LISTEN_TO_VOTE = 0.5;

function PlayerHeader({ p, align, isWinner, eloDelta }: {
  p: ProfileSummary | null; align: 'start' | 'end'; isWinner: boolean; eloDelta: number | null;
}) {
  return (
    <div className={`grid min-w-0 gap-1 ${align === 'end' ? 'md:justify-items-end md:text-right' : ''}`}>
      <h2 className="handle text-[clamp(1.75rem,5vw,3.25rem)] leading-none break-all">
        {p ? (
          <Link href={`/beatboxers/${p.username}`} className="underline-offset-4 hover:underline">@{p.username}</Link>
        ) : (
          <span className="text-muted">Open slot</span>
        )}
      </h2>
      {p && (
        <p className="text-muted">
          <span aria-hidden="true">{flagEmoji(p.country)} </span>
          <span className="num text-ink">{p.elo_rating}</span> rating
          {eloDelta != null && (
            <span className={`num ml-2 ${eloDelta >= 0 ? 'text-win' : 'text-loss'}`}>{signed(eloDelta)}</span>
          )}
          {isWinner && <span className="ml-2 rounded-full bg-win px-2 py-0.5 text-sm text-paper">Winner</span>}
        </p>
      )}
    </div>
  );
}

export default function BattleView({ battle, submissions, initialVotes, currentUserId, inviteToken, shareToken }: Props) {
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
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, battle.id, router]);

  // Move the battle on the moment a deadline passes, instead of waiting for the cron job.
  useEffect(() => {
    const due: (string | null)[] = [];
    if (battle.status === 'open' || battle.status === 'pending') due.push(battle.turn_deadline);
    if (battle.status === 'active') due.push(battle.mode === 'live' ? battle.starts_at : battle.turn_deadline);
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
  const votingHours = intervalHours(battle.voting_window);
  const isParticipant = currentUserId != null && (currentUserId === battle.challenger_id || currentUserId === battle.opponent_id);
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

  const heardAll = submissions.length > 0 && submissions.every((s) => (listened[s.id] ?? 0) >= LISTEN_TO_VOTE);
  const expectedRound = Math.floor(battle.turn_number / 2) + 1;

  const statusLine = (() => {
    switch (battle.status) {
      case 'open':
        return <>Open challenge, waiting for an opponent. Expires in <Countdown to={battle.turn_deadline!} />.</>;
      case 'pending':
        return isLive
          ? <>Waiting for @{nameOf(battle.opponent_id)} to accept. The battle starts in <Countdown to={battle.starts_at!} />.</>
          : <>Waiting for @{nameOf(battle.opponent_id)} to accept. Expires in <Countdown to={battle.turn_deadline!} />.</>;
      case 'active':
        if (isLive) return <>Rounds are being locked in. The battle starts in <Countdown to={battle.starts_at!} />.</>;
        return battle.current_turn_user_id === currentUserId
          ? <>Your turn. <Countdown to={battle.turn_deadline!} /> left to respond.</>
          : <>@{nameOf(battle.current_turn_user_id)} is up. <Countdown to={battle.turn_deadline!} /> left to respond.</>;
      case 'live':
        return <>Live now.</>;
      case 'voting':
        return <>Voting closes in <Countdown to={battle.voting_ends_at!} />.</>;
      case 'finished':
        if (battle.result === 'forfeit')
          return isLive
            ? <>@{nameOf(battle.winner_id)} wins by forfeit. @{nameOf(battle.forfeited_by)} didn’t get a round in before the start.</>
            : <>@{nameOf(battle.winner_id)} wins by forfeit. @{nameOf(battle.forfeited_by)} missed the response window.</>;
        if (battle.result === 'draw') return <>Draw, {tally[0]} votes each.</>;
        if (battle.result === 'no_contest') return <>No votes were cast, so ratings didn’t change.</>;
        return <>@{nameOf(battle.winner_id)} wins by decision, {Math.max(...tally)} to {Math.min(...tally)}.</>;
      case 'cancelled':
        return <>This challenge expired or was declined before it started.</>;
    }
  })();

  const details = `${isLive ? 'Live battle. ' : ''}${battle.rounds_per_player === 1 ? 'One round' : `${battle.rounds_per_player} rounds`} each, ${battle.round_duration_seconds} seconds per round, voting open ${hoursText(votingHours)}${isLive ? ' after the last round' : ''}`;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const handleSubmit = useCallback(async (take: PreparedTake) => {
    if (!currentUserId) throw new Error('Log in to submit a round.');
    await submitTake(supabase, battle.id, currentUserId, take);
    router.refresh();
  }, [supabase, battle.id, currentUserId, router]);

  const vote = (userId: string) => run(async () => {
    const v = await castVote(supabase, battle.id, userId);
    setVotes((prev) => (prev.some((x) => x.id === v.id) ? prev : [...prev, v]));
  });

  const canAccept = currentUserId != null && currentUserId !== battle.challenger_id &&
    (battle.status === 'open' || (battle.status === 'pending' && battle.opponent_id === currentUserId));
  const canDecline = isParticipant && (battle.status === 'open' || battle.status === 'pending');
  const showLiveRoom = isLive && (battle.status === 'active' || battle.status === 'live');
  const inviteUrl = shareToken && origin ? `${origin}/battles/${battle.id}?t=${shareToken}` : null;

  return (
    <article className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6">
      <header className="grid gap-6">
        <div className="grid items-end gap-4 md:grid-cols-[1fr_auto_1fr]">
          <PlayerHeader p={challenger} align="start" isWinner={battle.winner_id === battle.challenger_id}
            eloDelta={battle.status === 'finished' ? battle.challenger_elo_delta : null} />
          <span className="handle text-2xl text-muted md:pb-6" aria-hidden="true">vs</span>
          <PlayerHeader p={opponent} align="end" isWinner={battle.opponent_id != null && battle.winner_id === battle.opponent_id}
            eloDelta={battle.status === 'finished' ? battle.opponent_elo_delta : null} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-y border-line py-3">
          <p className="num text-lg" role="status">{statusLine}</p>
          <p className="text-sm text-muted">{details}</p>
        </div>

        {(canAccept || canDecline || (inviteUrl && (battle.status === 'open' || battle.status === 'pending'))) && (
          <div className="flex flex-wrap items-center gap-3">
            {canAccept && (
              <button onClick={() => run(async () => { await acceptChallenge(supabase, battle.id, inviteToken); router.refresh(); })}
                disabled={busy} className="rounded-full bg-ink px-6 py-3 text-paper disabled:opacity-60">
                {battle.status === 'open' ? 'Take this battle' : 'Accept challenge'}
              </button>
            )}
            {canDecline && (
              <button onClick={() => run(async () => { await declineChallenge(supabase, battle.id); router.refresh(); })}
                disabled={busy} className="rounded-full border border-line px-6 py-3">
                {currentUserId === battle.challenger_id ? 'Cancel challenge' : 'Decline'}
              </button>
            )}
            {inviteUrl && currentUserId === battle.challenger_id && (
              <button onClick={() => navigator.clipboard.writeText(inviteUrl)} className="rounded-full border border-line px-6 py-3">
                Copy invite link
              </button>
            )}
          </div>
        )}
        {!currentUserId && (battle.status === 'open' || battle.status === 'pending') && (
          <p><Link href={`/login?next=/battles/${battle.id}`} className="underline underline-offset-4">Log in</Link> to take this battle.</p>
        )}
      </header>

      {showLiveRoom ? (
        <LiveRoom battle={battle} submissions={submissions} currentUserId={currentUserId} onHeard={addHeard} />
      ) : (
        <>
          {submissions.length > 1 && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={matchLoudness} onChange={(e) => setMatchLoudness(e.target.checked)} className="size-4 accent-[var(--signal)]" />
                Match loudness
              </label>
              <span className="max-w-prose text-muted">Turns the louder side down so nobody wins on volume. Nothing is compressed or boosted.</span>
              <span className="flex items-center gap-2 text-muted">
                <span className="inline-block h-3 w-1 rounded-sm bg-sub" aria-hidden="true" />
                Sub-bass below 100 Hz
              </span>
              {isLive && <span className="text-muted">Replays of the live premiere.</span>}
            </div>
          )}

          {battle.status !== 'cancelled' && battle.status !== 'open' && battle.status !== 'pending' && (
            <div className="grid gap-10">
              {Array.from({ length: battle.rounds_per_player }, (_, i) => i + 1).map((round) => (
                <section key={round} aria-labelledby={`round-${round}`} className="grid gap-4">
                  <h3 id={`round-${round}`} className="text-sm text-muted">Round {round}</h3>
                  <div className="grid gap-6 md:grid-cols-2 md:gap-10">
                    {sides.map((side, idx) => {
                      const sub = submissions.find((s) => s.user_id === side.id && s.round_number === round);
                      const isTurn = !isLive && battle.status === 'active' && battle.current_turn_user_id === side.id && round === expectedRound;
                      const who = side.profile ? `@${side.profile.username}` : 'Open slot';
                      if (sub) {
                        const heard = listened[sub.id] ?? 0;
                        return (
                          <div key={idx} className="grid gap-2">
                            <p className="text-sm">{who}{!sub.is_lossless && <span className="ml-2 text-muted">compressed upload</span>}</p>
                            <WaveformPlayer src={audioUrl(sub.stream_path ?? sub.audio_path)} waveform={sub.waveform_data}
                              durationMs={sub.duration_ms} gainDb={gainFor(sub)} label={`${who} round ${round}`}
                              onListenProgress={(f) => setHeard(sub.id, f)} />
                            {battle.status === 'voting' && !isParticipant && !myVote && (
                              <p className="text-sm text-muted">{heard >= LISTEN_TO_VOTE ? 'Heard' : `${Math.round(heard * 100)}% heard`}</p>
                            )}
                          </div>
                        );
                      }
                      if (isTurn && side.id === currentUserId) {
                        return (
                          <div key={idx} className="grid gap-3 md:col-span-2">
                            <p>Your round {round}. You have <Countdown to={battle.turn_deadline!} /> to submit.</p>
                            <AudioRecorder maxSeconds={battle.round_duration_seconds} onSubmit={handleSubmit} submitLabel={`Submit round ${round}`} />
                          </div>
                        );
                      }
                      return (
                        <div key={idx} className="grid min-h-28 place-items-center rounded-xl border border-dashed border-line p-4 text-center text-muted">
                          {isTurn ? <span>Waiting for {who}. <Countdown to={battle.turn_deadline!} /> left.</span>
                            : battle.status === 'finished' ? 'Not recorded' : `${who} hasn’t recorded this round yet`}
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

      {(battle.status === 'voting' || battle.status === 'finished') && battle.opponent_id && battle.result !== 'forfeit' && (
        <section aria-labelledby="vote-heading" className="grid gap-5 rounded-2xl bg-surface p-5 sm:p-6">
          <h3 id="vote-heading" className="text-xl">{battle.status === 'voting' ? 'Who took it?' : 'Votes'}</h3>

          {battle.status === 'voting' && (
            !currentUserId ? (
              <p><Link href={`/login?next=/battles/${battle.id}`} className="underline underline-offset-4">Log in to vote</Link>. Votes are public and tied to your profile.</p>
            ) : isParticipant ? (
              <p className="text-muted">You can’t vote in your own battle.</p>
            ) : myVote ? (
              <p>You voted for @{nameOf(myVote.voted_for_user_id)}.</p>
            ) : (
              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {sides.map((side) => (
                    <button key={side.id} onClick={() => side.id && vote(side.id)} disabled={!heardAll || busy}
                      className="rounded-xl border-2 border-ink px-5 py-4 text-lg hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:border-line disabled:text-muted disabled:hover:bg-transparent">
                      Vote for <span className="handle">@{side.profile?.username}</span>
                    </button>
                  ))}
                </div>
                {!heardAll && <p className="text-sm text-muted">Listen to at least half of every round to unlock voting.</p>}
              </div>
            )
          )}

          {showTally ? (
            <div className="grid gap-2">
              <div className="num flex justify-between text-lg">
                <span>{tally[0]}</span>
                <span className="text-sm text-muted">{totalVotes === 1 ? '1 vote' : `${totalVotes} votes`}</span>
                <span>{tally[1]}</span>
              </div>
              <div className="flex h-3 overflow-hidden rounded-full bg-line" role="img"
                aria-label={`${tally[0]} votes for @${challenger.username}, ${tally[1]} for @${opponent?.username}`}>
                <div className="bg-signal" style={{ width: totalVotes ? `${(tally[0] / totalVotes) * 100}%` : '50%' }} />
                <div className="flex-1 bg-sub" />
              </div>
            </div>
          ) : battle.status === 'voting' && (
            <p className="text-sm text-muted">Vote counts appear after you vote, so the crowd doesn’t steer you.</p>
          )}

          {battle.status === 'finished' && votes.length > 0 && (
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              {sides.map((side) => {
                const voters = votes.filter((v) => v.voted_for_user_id === side.id);
                return (
                  <div key={side.id}>
                    <p className="mb-1 text-muted">Voted for @{side.profile?.username}</p>
                    <p>
                      {voters.length === 0 ? 'Nobody' : voters.slice(0, 40).map((v, i) => (
                        <span key={v.id}>
                          {i > 0 && ', '}
                          {v.voter ? <Link href={`/beatboxers/${v.voter.username}`} className="underline-offset-4 hover:underline">@{v.voter.username}</Link> : 'a voter'}
                        </span>
                      ))}
                      {voters.length > 40 && ` and ${voters.length - 40} more`}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {error && <p className="text-loss" role="alert">{error}</p>}
    </article>
  );
}
