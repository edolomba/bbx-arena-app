'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionState, LocalAudioTrack, Room, RoomEvent, Track, type RemoteParticipant, type RemoteTrack } from 'livekit-client';
import { createClient } from '@/lib/supabase/client';
import { castVote, stageRpc, submitTake } from '@/lib/supabase/battles';
import { getPlaybackContext } from '@/lib/audio/playback-bus';
import { useServerClock } from '@/hooks/useServerClock';
import { useHiFiRecorder } from '@/hooks/useHiFiRecorder';
import { STAGE_LISTEN_GRACE_MS, STAGE_PUBLISH, slotKey } from '@/lib/live/stage';
import { formatClock, formatTime } from '@/lib/format';
import type { BattleJudge, BattleWithPlayers, Vote } from '@/lib/types';

interface Props {
  battle: BattleWithPlayers;
  judges: BattleJudge[];
  votes: Vote[];
  currentUserId: string | null;
  onHeard: (key: string, fraction: number) => void;
}

type Upload = { round: number; state: 'recording' | 'uploading' | 'done' | 'failed'; message?: string };

const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);

/**
 * A host-run real-time battle. The host's buttons write the stage state to the
 * database (which round, when it starts and ends, voting window); every screen
 * reads the same state and the same server clock, so the room stays in sync and
 * a reload lands exactly where the battle is.
 */
export default function StageRoom({ battle, judges, votes, currentUserId, onHeard }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const clock = useServerClock();
  const now = clock.now;
  const rec = useHiFiRecorder({ maxSeconds: battle.round_duration_seconds });

  const A = battle.challenger_id;
  const B = battle.opponent_id ?? '';
  const names: Record<string, string> = { [A]: battle.challenger.username, [B]: battle.opponent?.username ?? '' };
  const totalSlots = 2 * battle.rounds_per_player;
  const slotUser = (slot: number) => (slot % 2 === 0 ? A : B);
  const slotRound = (slot: number) => Math.floor(slot / 2) + 1;

  const isHost = !!currentUserId && currentUserId === battle.host_id;
  const isPerformer = !!currentUserId && (currentUserId === A || currentUserId === B);
  const activeJudges = judges.filter((j) => j.active);
  const isJudge = !!currentUserId && activeJudges.some((j) => j.judge_id === currentUserId);
  const judged = (battle.judge_count ?? 0) > 0;

  const [, setTick] = useState(0);
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [present, setPresent] = useState<string[]>([]);
  const [audience, setAudience] = useState(0);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [myJudgeVote, setMyJudgeVote] = useState<string | null>(null);
  const [replaceFor, setReplaceFor] = useState<string | null>(null);
  const [replacement, setReplacement] = useState('');

  const roomRef = useRef<Room | null>(null);
  const micRef = useRef<LocalAudioTrack | null>(null);
  const audioEls = useRef(new Map<string, HTMLMediaElement>());
  const analysers = useRef(new Map<string, AnalyserNode>());
  const levelRefs = useRef(new Map<string, HTMLDivElement>());
  const recordingKey = useRef<string | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 200);
    return () => window.clearInterval(t);
  }, []);

  // A new voting round clears the judge's local "vote sent" state.
  useEffect(() => {
    if (battle.stage_phase !== 'voting') setMyJudgeVote(null);
  }, [battle.stage_phase, battle.stage_started_at]);

  const refreshPresence = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const ids = [...room.remoteParticipants.values()].map((p) => p.identity);
    ids.push(room.localParticipant.identity);
    setPresent(ids);
    setAudience(room.numParticipants);
  }, []);

  useEffect(() => () => {
    micRef.current?.stop();
    audioEls.current.forEach((el) => el.remove());
    void roomRef.current?.disconnect();
  }, []);

  const enter = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      if (isPerformer) await rec.prepare();
      const res = await fetch('/api/livekit/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ battleId: battle.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'The room couldn’t be opened.');

      const room = new Room({ adaptiveStream: false, dynacast: false });
      roomRef.current = room;
      room
        .on(RoomEvent.ConnectionStateChanged, (s) => setConnection(s))
        .on(RoomEvent.ParticipantConnected, refreshPresence)
        .on(RoomEvent.ParticipantDisconnected, refreshPresence)
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
          if (track.kind !== Track.Kind.Audio) return;
          const el = track.attach();
          el.muted = true;
          document.body.appendChild(el);
          audioEls.current.set(participant.identity, el);
          try {
            const ctx = getPlaybackContext();
            const analyser = new AnalyserNode(ctx, { fftSize: 1024 });
            new MediaStreamAudioSourceNode(ctx, { mediaStream: new MediaStream([track.mediaStreamTrack]) }).connect(analyser);
            analysers.current.set(participant.identity, analyser);
          } catch { /* meter is cosmetic */ }
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
          track.detach().forEach((el) => el.remove());
          audioEls.current.delete(participant.identity);
          analysers.current.delete(participant.identity);
        });

      await getPlaybackContext().resume();
      await room.connect(body.url, body.token);
      await room.startAudio();
      refreshPresence();

      if (isPerformer) {
        const source = rec.getStream()?.getAudioTracks()[0];
        if (!source) throw new Error('The microphone didn’t start.');
        const mic = new LocalAudioTrack(source.clone(), undefined, true);
        await mic.mute();
        await room.localParticipant.publishTrack(mic, { source: Track.Source.Microphone, ...STAGE_PUBLISH });
        micRef.current = mic;
      }
      setJoined(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The room couldn’t be opened.');
      void roomRef.current?.disconnect();
      roomRef.current = null;
    } finally {
      setConnecting(false);
    }
  }, [battle.id, isPerformer, rec, refreshPresence]);

  // ---------------- current stage state ----------------
  const t = now();
  const phase = battle.stage_phase;
  const slot = battle.stage_slot;
  const roundStart = ms(battle.stage_started_at);
  const roundEnd = ms(battle.stage_ends_at);
  const inRoundPhase = phase === 'round' && slot !== null;
  const counting = inRoundPhase && t < roundStart;
  const performing = inRoundPhase && t >= roundStart && t < roundEnd;
  const audibleUser = inRoundPhase && t >= roundStart && t < roundEnd + STAGE_LISTEN_GRACE_MS ? slotUser(slot!) : null;
  const performerNow = inRoundPhase ? slotUser(slot!) : null;
  const myTurn = !!performerNow && performerNow === currentUserId;
  const roundsDone = slot !== null && (phase !== 'round' || t >= roundEnd) ? slot + 1 : slot ?? 0;
  const nextSlot = slot === null ? 0 : slot + 1;
  const votingLeft = phase === 'voting' ? roundEnd - t : 0;

  // Listeners hear only the performer whose round is running.
  useEffect(() => {
    audioEls.current.forEach((el, identity) => {
      el.muted = identity !== audibleUser;
    });
  });

  // Heard time counts toward the "listen before you vote" rule for the public vote.
  const lastRef = useRef(Date.now());
  useEffect(() => {
    const iv = window.setInterval(() => {
      const wall = Date.now();
      const dt = wall - lastRef.current;
      lastRef.current = wall;
      if (!joined || isPerformer || !performing || slot === null) return;
      if (audioEls.current.has(slotUser(slot))) onHeard(slotKey(slotUser(slot), slotRound(slot)), dt / (roundEnd - roundStart));
    }, 250);
    return () => window.clearInterval(iv);
  });

  // Performer: mic open and recording exactly while their round runs.
  useEffect(() => {
    if (!joined || !isPerformer) return;
    const key = myTurn && performing ? `${slot}:${battle.stage_started_at}` : null;
    if (key === recordingKey.current) return;
    const mic = micRef.current;

    if (key) {
      recordingKey.current = key;
      const round = slotRound(slot!);
      void mic?.unmute();
      void rec.start();
      setUploads((u) => [...u.filter((x) => x.round !== round), { round, state: 'recording' }]);
    } else if (recordingKey.current) {
      const round = slotRound(Number(recordingKey.current.split(':')[0]));
      recordingKey.current = null;
      void mic?.mute();
      (async () => {
        const take = await rec.stop();
        if (!take || !currentUserId) {
          setUploads((u) => u.map((x) => (x.round === round ? { ...x, state: 'failed', message: 'Nothing was recorded.' } : x)));
          return;
        }
        rec.reset();
        setUploads((u) => u.map((x) => (x.round === round ? { ...x, state: 'uploading' } : x)));
        try {
          await submitTake(supabase, battle.id, currentUserId, take);
          setUploads((u) => u.map((x) => (x.round === round ? { ...x, state: 'done' } : x)));
        } catch (err) {
          setUploads((u) => u.map((x) => (x.round === round ? { ...x, state: 'failed', message: err instanceof Error ? err.message : '' } : x)));
        }
      })();
    }
  });

  // When the judges' time runs out, anyone's screen asks the database to count.
  const tallied = useRef<string | null>(null);
  useEffect(() => {
    if (phase !== 'voting' || t < roundEnd + 500) return;
    const key = battle.stage_started_at ?? '';
    if (tallied.current === key) return;
    tallied.current = key;
    void stageRpc(supabase, 'stage_tally', { p_battle: battle.id }).catch(() => {});
  });

  // Level meters.
  const getLevels = rec.getLevels;
  useEffect(() => {
    let raf = 0;
    const buf = new Float32Array(1024);
    const toBar = (db: number) => Math.max(0, Math.min(1, (db + 60) / 54));
    const loop = () => {
      analysers.current.forEach((a, identity) => {
        const bar = levelRefs.current.get(identity);
        if (!bar) return;
        a.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        bar.style.transform = `scaleX(${toBar(20 * Math.log10(Math.sqrt(sum / buf.length) || 1e-9))})`;
      });
      if (currentUserId) {
        const bar = levelRefs.current.get(currentUserId);
        const l = getLevels();
        if (bar && l) bar.style.transform = `scaleX(${toBar(l.rmsDb)})`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [getLevels, currentUserId]);

  // ---------------- actions ----------------
  async function act(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await stageRpc(supabase, fn, { p_battle: battle.id, ...args });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function judgeVote(userId: string) {
    setMyJudgeVote(userId);
    try {
      await stageRpc(supabase, 'judge_vote', { p_battle: battle.id, p_voted_for: userId });
    } catch (err) {
      setMyJudgeVote(null);
      setError(err instanceof Error ? err.message : 'Your vote didn’t go through.');
    }
  }

  const myCrowdVote = votes.find((v) => v.voter_id === currentUserId) ?? null;
  const crowd = [A, B].map((u) => votes.filter((v) => v.voted_for_user_id === u).length);
  const canCrowdVote = !!currentUserId && !isHost && !isJudge && !isPerformer && judged && ['voting', 'tiebreak', 'result'].includes(phase);

  const levelBar = (identity: string) => (
    <div className="h-2 w-full overflow-hidden rounded-full bg-line" aria-hidden="true">
      <div ref={(el) => { if (el) levelRefs.current.set(identity, el); }} className="h-full origin-left rounded-full bg-sub" style={{ transform: 'scaleX(0)' }} />
    </div>
  );
  const big = 'num text-[clamp(5rem,19vw,11rem)] leading-[0.85] [font-stretch:70%]';
  const btn = 'rounded-full px-5 py-2.5 disabled:opacity-50';

  const opened = battle.status === 'live';

  return (
    <div className="grid gap-10">
      <p className="flex flex-wrap items-center gap-x-2 text-lg">
        <span className={`inline-flex items-center gap-2 font-semibold ${opened ? 'text-sub' : ''}`}>
          <span className={`size-2.5 rounded-full ${opened ? 'animate-pulse bg-sub' : 'bg-muted'}`} aria-hidden="true" />
          {opened ? 'Stage open' : 'Stage battle'}
        </span>
        {!battle.ranked && <span className="rounded-full border border-line px-2 py-0.5 text-sm text-muted">Casual: no rating or points</span>}
        {joined && (
          <>
            <span className="num">{audience}</span>
            <span className="text-muted">{audience === 1 ? 'person' : 'people'} in the room</span>
            {connection !== ConnectionState.Connected && <span className="text-loss">reconnecting…</span>}
          </>
        )}
      </p>

      {/* ---------------- Stage display ---------------- */}
      <section className="grid justify-items-start gap-3" aria-label="Stage">
        {!opened && (
          <>
            <p className="text-lg text-muted">Stage opens in</p>
            <p className={big}>{formatClock(ms(battle.starts_at) - t)}</p>
            <p className="max-w-[56ch] text-lg">
              The host @{battle.host?.username ?? 'host'} calls each round live. {judged
                ? `${battle.judge_count} judges vote right after the last round.`
                : 'The audience votes after the battle.'}
            </p>
          </>
        )}

        {opened && counting && (
          <>
            <p className="text-lg text-muted">{myTurn ? 'You’re on in' : `@${names[performerNow!]} is on in`}</p>
            <p className={`${big} text-sub`}>{Math.ceil((roundStart - t) / 1000)}</p>
            <p className="text-muted">Round {slotRound(slot!)}{myTurn ? '. Get close to the mic.' : ''}</p>
          </>
        )}

        {opened && performing && (
          myTurn ? (
            <>
              <p className="text-lg font-semibold text-sub">You’re on. Go.</p>
              <p className={big}>{formatClock(roundEnd - t)}</p>
              <p className="text-muted">Round {slotRound(slot!)}. Your mic closes by itself when time runs out.</p>
            </>
          ) : (
            <>
              <p className="text-lg text-muted">Now performing, round {slotRound(slot!)}</p>
              <h2 className="handle text-[clamp(2rem,6vw,3.6rem)] leading-none">@{names[performerNow!]}</h2>
              <p className="num text-muted">{formatTime((t - roundStart) / 1000)} / {formatTime((roundEnd - roundStart) / 1000)}</p>
              {joined && levelBar(performerNow!)}
              {joined && !present.includes(performerNow!) && <p className="text-loss">@{names[performerNow!]} isn’t in the room.</p>}
            </>
          )
        )}

        {opened && !counting && !performing && phase !== 'voting' && phase !== 'tiebreak' && phase !== 'result' && (
          <>
            <p className="text-lg text-muted">{roundsDone === 0 ? 'Waiting for the host to start' : roundsDone >= totalSlots ? 'All rounds done' : 'Next up'}</p>
            <h2 className="handle text-[clamp(2rem,6vw,3.6rem)] leading-none">
              {roundsDone >= totalSlots ? (judged ? 'Judges are up next' : 'Voting is next') : `@${names[slotUser(nextSlot)]}`}
            </h2>
          </>
        )}

        {opened && phase === 'voting' && (
          <>
            <p className="text-lg text-muted">The judges are voting</p>
            <p className={big}>{Math.max(0, Math.ceil(votingLeft / 1000))}</p>
            <p className="num text-muted">{battle.stage_votes_in} of {battle.judge_count} votes in</p>
          </>
        )}

        {opened && phase === 'tiebreak' && (
          <>
            <p className="text-[clamp(2rem,6vw,3.6rem)] leading-none font-bold">Tied.</p>
            <p className="text-muted">The host decides the winner.</p>
          </>
        )}

        {!joined && (
          <div className="grid justify-items-start gap-2">
            <button onClick={enter} disabled={connecting} className="rounded-full bg-ink px-7 py-3.5 text-lg text-paper disabled:opacity-60">
              {connecting ? 'Opening the room…' : isPerformer ? 'Enter the stage' : isHost ? 'Enter as host' : isJudge ? 'Enter as judge' : 'Enter to listen'}
            </button>
            <p className="text-sm text-muted">
              {isPerformer ? 'Use headphones and enter a few minutes early to check your levels. Your mic only opens on your round.'
                : 'Sound starts after you enter. Headphones or good speakers: there’s a lot of low end.'}
            </p>
          </div>
        )}
        {error && <p role="alert" className="text-loss">{error}</p>}
      </section>

      {/* ---------------- Judge panel ---------------- */}
      {isJudge && opened && phase === 'voting' && (
        <section className="grid gap-4 rounded-2xl border-2 border-sub p-5" aria-label="Your vote">
          <h2 className="text-xl font-bold [font-stretch:112%]">Your vote</h2>
          {myJudgeVote ? (
            <p className="text-lg">You voted for <strong>@{names[myJudgeVote]}</strong>. Waiting for the other judges.</p>
          ) : votingLeft <= -2000 ? (
            <p className="text-loss">Time’s up.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {[A, B].map((u) => (
                <button key={u} onClick={() => judgeVote(u)} className="rounded-2xl bg-ink px-5 py-6 text-2xl text-paper">
                  <span className="handle">@{names[u]}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ---------------- Host panel ---------------- */}
      {isHost && (
        <section className="grid gap-4 rounded-2xl border-2 border-ink p-5" aria-label="Host controls">
          <h2 className="text-xl font-bold [font-stretch:112%]">Host controls</h2>
          {!opened ? (
            <p className="text-muted">Your buttons appear when the stage opens at the start time.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {(phase === 'idle' || (phase === 'round' && t >= roundEnd)) && nextSlot < totalSlots && (
                  <button disabled={busy} onClick={() => act('stage_start_round', {})} className={`${btn} bg-ink text-paper`}>
                    Start round {slotRound(nextSlot)}: @{names[slotUser(nextSlot)]}
                  </button>
                )}
                {performing && (
                  <button disabled={busy} onClick={() => act('stage_stop_round', {})} className={`${btn} border border-line`}>Stop round now</button>
                )}
                {slot !== null && !counting && !performing && phase === 'round' && (
                  <button disabled={busy} onClick={() => act('stage_start_round', { p_slot: slot })} className={`${btn} border border-line`}>
                    Redo round {slotRound(slot)} (@{names[slotUser(slot)]})
                  </button>
                )}
                {slot !== null && !counting && !performing && phase === 'round' && roundsDone >= totalSlots && (
                  <button disabled={busy} onClick={() => act('stage_start_voting', {})} className={`${btn} bg-sub text-paper`}>
                    {judged ? 'Start voting' : 'Open the public vote'}
                  </button>
                )}
                {phase === 'tiebreak' && [A, B].map((u) => (
                  <button key={u} disabled={busy} onClick={() => act('stage_host_decide', { p_winner: u })} className={`${btn} bg-ink text-paper`}>
                    Winner: @{names[u]}
                  </button>
                ))}
              </div>
              <p className="text-sm text-muted">
                Rounds start 3 seconds after you click, so every screen counts down together. Redo a round if someone’s connection dropped.
              </p>
            </>
          )}

          {judged && phase !== 'voting' && phase !== 'tiebreak' && phase !== 'result' && (
            <div className="grid gap-2 border-t border-line pt-4">
              <h3 className="font-semibold">Judges</h3>
              <ul className="grid gap-1 text-sm">
                {activeJudges.map((j) => (
                  <li key={j.judge_id} className="flex flex-wrap items-center gap-2">
                    <span>@{j.judge?.username}{j.is_reserve ? ' (reserve)' : ''}</span>
                    <span className={present.includes(j.judge_id) ? 'text-win' : 'text-muted'}>{joined ? (present.includes(j.judge_id) ? 'in the room' : 'not in the room') : ''}</span>
                    <button onClick={() => { setReplaceFor(j.judge_id); setReplacement(''); }} className="text-muted underline underline-offset-4">Replace</button>
                    {replaceFor === j.judge_id && (
                      <span className="flex items-center gap-2">
                        <input value={replacement} onChange={(e) => setReplacement(e.target.value.replace(/^@/, ''))} placeholder="new judge handle"
                          className="rounded-lg border border-line bg-surface px-2 py-1" />
                        <button disabled={busy || !replacement} className="rounded-full bg-ink px-3 py-1 text-paper"
                          onClick={async () => { await act('stage_replace_judge', { p_old: j.judge_id, p_new_username: replacement }); setReplaceFor(null); }}>
                          Confirm
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ---------------- Crowd vote ---------------- */}
      {judged && opened && ['voting', 'tiebreak', 'result'].includes(phase) && (
        <section className="grid gap-3" aria-label="Crowd vote">
          <h2 className="text-xl font-bold [font-stretch:112%]">Crowd vote</h2>
          <p className="text-sm text-muted">Just for fun: the judges decide the battle.</p>
          {canCrowdVote && !myCrowdVote && (
            <div className="flex flex-wrap gap-2">
              {[A, B].map((u) => (
                <button key={u} onClick={() => castVote(supabase, battle.id, u).catch((e) => setError(e.message))}
                  className="rounded-full border-2 border-ink px-5 py-2.5">@{names[u]}</button>
              ))}
            </div>
          )}
          <p className="num">@{names[A]} {crowd[0]} to {crowd[1]} @{names[B]}</p>
        </section>
      )}

      {/* ---------------- Performer status ---------------- */}
      {isPerformer && joined && (
        <section className="grid max-w-xl gap-3 rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-xl font-bold [font-stretch:112%]">Your mic</h2>
          {levelBar(currentUserId!)}
          <p className="text-sm text-muted">The bar shows your level so you can check it any time. It only goes out to the room during your rounds, with voice processing off.</p>
          {rec.warnings.length > 0 && (
            <ul className="grid gap-1 rounded-lg border border-sub/40 bg-sub/5 p-3 text-sm">{rec.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          )}
          {uploads.map((u) => (
            <p key={u.round} className={`text-sm ${u.state === 'failed' ? 'text-loss' : u.state === 'done' ? 'text-win' : ''}`}>
              Round {u.round} replay: {u.state === 'recording' ? 'recording…' : u.state === 'uploading' ? 'uploading…' : u.state === 'done' ? 'saved' : `failed. ${u.message ?? ''}`}
            </p>
          ))}
        </section>
      )}

      {/* ---------------- Running order ---------------- */}
      <section className="grid gap-3">
        <h2 className="text-xl font-bold [font-stretch:112%]">Running order</h2>
        <ol className="grid">
          {Array.from({ length: totalSlots }, (_, i) => {
            const done = i < roundsDone;
            const live = i === slot && (counting || performing);
            return (
              <li key={i} className={`grid grid-cols-[1.75rem_1fr_auto] items-center gap-3 border-b border-line py-3 ${live ? 'text-sub' : ''}`}>
                <span className="num text-muted">{i + 1}</span>
                <span>@{names[slotUser(i)]}, round {slotRound(i)}</span>
                <span className="text-sm text-muted">{live ? 'On now' : done ? 'Done' : ''}</span>
              </li>
            );
          })}
        </ol>
        {judged && (
          <p className="text-sm text-muted">
            Judges: {activeJudges.filter((j) => !j.is_reserve).map((j) => `@${j.judge?.username}`).join(', ')}
            {activeJudges.some((j) => j.is_reserve) && `, reserve @${activeJudges.find((j) => j.is_reserve)?.judge?.username}`}
          </p>
        )}
      </section>
    </div>
  );
}
