'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionState, LocalAudioTrack, Room, RoomEvent, Track, type RemoteTrack, type RemoteParticipant } from 'livekit-client';
import { createClient } from '@/lib/supabase/client';
import { getPlaybackContext } from '@/lib/audio/playback-bus';
import { submitTake } from '@/lib/supabase/battles';
import { useServerClock } from '@/hooks/useServerClock';
import { useHiFiRecorder } from '@/hooks/useHiFiRecorder';
import { STAGE_LISTEN_GRACE_MS, STAGE_PUBLISH, slotKey, stageSchedule, type StageSlot } from '@/lib/live/stage';
import { formatClock, formatTime, hoursText, intervalHours } from '@/lib/format';
import type { BattleWithPlayers } from '@/lib/types';

interface Props {
  battle: BattleWithPlayers;
  currentUserId: string | null;
  /** Adds heard time (fraction of a round) so live listening unlocks voting. */
  onHeard: (key: string, fraction: number) => void;
}

type Upload = { round: number; state: 'recording' | 'uploading' | 'done' | 'failed'; message?: string };

/**
 * A real-time battle. Everyone joins one LiveKit audio room; the timeline
 * (who performs when) is computed from the start time against the server
 * clock, so no host is needed.
 *
 * Performers: the same microphone stream is sent live (Opus at 192 kbps, no
 * voice processing) and recorded locally as lossless WAV, which is uploaded as
 * the replay right after each turn.
 * Listeners: a performer is only audible during their own turn, so nobody can
 * talk over the other battler.
 */
export default function StageRoom({ battle, currentUserId, onHeard }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const clock = useServerClock();
  const now = clock.now;
  const rec = useHiFiRecorder({ maxSeconds: battle.round_duration_seconds });
  const { slots, endsAt } = useMemo(() => stageSchedule(battle), [battle]);
  const startsAt = new Date(battle.starts_at!).getTime();
  const isPerformer = currentUserId === battle.challenger_id || currentUserId === battle.opponent_id;
  const names: Record<string, string> = {
    [battle.challenger_id]: battle.challenger.username,
    [battle.opponent_id ?? '']: battle.opponent?.username ?? '',
  };

  const [, setTick] = useState(0);
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [error, setError] = useState<string | null>(null);
  const [present, setPresent] = useState<string[]>([]);
  const [audience, setAudience] = useState(0);
  const [uploads, setUploads] = useState<Upload[]>([]);

  const roomRef = useRef<Room | null>(null);
  const micRef = useRef<LocalAudioTrack | null>(null);
  const audioEls = useRef(new Map<string, HTMLMediaElement>());
  const levelRefs = useRef(new Map<string, HTMLDivElement>());
  const analysers = useRef(new Map<string, AnalyserNode>());
  const activeSlotRef = useRef<number | null>(null);

  // Re-render a few times a second for timers and the stage.
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 200);
    return () => window.clearInterval(t);
  }, []);

  const refreshPresence = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const ids = [...room.remoteParticipants.values()].map((p) => p.identity);
    if (room.localParticipant) ids.push(room.localParticipant.identity);
    setPresent(ids);
    setAudience(room.numParticipants);
  }, []);

  // Leave cleanly.
  useEffect(() => () => {
    micRef.current?.stop();
    audioEls.current.forEach((el) => el.remove());
    void roomRef.current?.disconnect();
  }, []);

  const enter = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      // Performers: open the microphone with voice processing off (same rules as the recorder).
      if (isPerformer) {
        await rec.prepare();
      }
      const res = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ battleId: battle.id }),
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
          el.muted = true; // opened only during this performer's turn
          document.body.appendChild(el);
          audioEls.current.set(participant.identity, el);
          // Level meter straight from the incoming audio (works for any sound, not just speech).
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

      await getPlaybackContext().resume(); // inside the click, so browsers allow sound
      await room.connect(body.url, body.token);
      await room.startAudio();
      refreshPresence();

      if (isPerformer) {
        const source = rec.getStream()?.getAudioTracks()[0];
        if (!source) throw new Error('The microphone didn’t start.');
        // A clone, so muting the live feed never silences the lossless recording.
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

  const t = now();
  const current = slots.find((s) => t >= s.at && t < s.end) ?? null;
  const next = slots.find((s) => t < s.at) ?? null;
  const hearing = slots.find((s) => t >= s.at && t < s.end + STAGE_LISTEN_GRACE_MS) ?? null;
  const phase: 'lobby' | 'stage' | 'ending' = t < startsAt ? 'lobby' : t < endsAt ? 'stage' : 'ending';

  // Listeners: only the performer whose turn it is can be heard.
  useEffect(() => {
    audioEls.current.forEach((el, identity) => {
      el.muted = !(hearing && hearing.userId === identity);
    });
  });

  // Count live listening toward the "listen before you vote" rule.
  const lastRef = useRef(Date.now());
  useEffect(() => {
    const iv = window.setInterval(() => {
      const wall = Date.now();
      const dt = wall - lastRef.current;
      lastRef.current = wall;
      if (!joined || isPerformer) return;
      const n = now();
      const slot = slots.find((s) => n >= s.at && n < s.end);
      if (slot && audioEls.current.has(slot.userId)) onHeard(slotKey(slot.userId, slot.round), dt / (slot.end - slot.at));
    }, 250);
    return () => window.clearInterval(iv);
  }, [joined, isPerformer, slots, now, onHeard]);

  // Level bars: the incoming audio for performers on stage, the local mic for yourself.
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

  // Performer: open the mic and record exactly during their own turns.
  const mySlotNow: StageSlot | null = isPerformer && current && current.userId === currentUserId ? current : null;
  useEffect(() => {
    if (!joined || !isPerformer) return;
    const mic = micRef.current;
    const slotIndex = mySlotNow?.index ?? null;
    if (slotIndex === activeSlotRef.current) return;

    if (slotIndex !== null && mySlotNow) {
      activeSlotRef.current = slotIndex;
      void mic?.unmute();
      void rec.start();
      setUploads((u) => [...u.filter((x) => x.round !== mySlotNow.round), { round: mySlotNow.round, state: 'recording' }]);
    } else if (activeSlotRef.current !== null) {
      const finished = slots[activeSlotRef.current];
      activeSlotRef.current = null;
      void mic?.mute();
      (async () => {
        const take = await rec.stop();
        if (!take || !currentUserId) {
          setUploads((u) => u.map((x) => (x.round === finished.round ? { ...x, state: 'failed', message: 'Nothing was recorded.' } : x)));
          return;
        }
        setUploads((u) => u.map((x) => (x.round === finished.round ? { ...x, state: 'uploading' } : x)));
        rec.reset();
        try {
          await submitTake(supabase, battle.id, currentUserId, take);
          setUploads((u) => u.map((x) => (x.round === finished.round ? { ...x, state: 'done' } : x)));
        } catch (err) {
          setUploads((u) => u.map((x) => (x.round === finished.round
            ? { ...x, state: 'failed', message: err instanceof Error ? err.message : 'Upload failed.' } : x)));
        }
      })();
    }
  });

  const votingHours = intervalHours(battle.voting_window);
  const isMyNext = !!next && next.userId === currentUserId;
  const secsToNext = next ? Math.ceil((next.at - t) / 1000) : 0;
  const levelBar = (identity: string) => (
    <div className="h-2 w-full overflow-hidden rounded-full bg-line" aria-hidden="true">
      <div ref={(el) => { if (el) levelRefs.current.set(identity, el); }} className="h-full origin-left rounded-full bg-sub" style={{ transform: 'scaleX(0)' }} />
    </div>
  );

  return (
    <div className="grid gap-10">
      <p className="flex flex-wrap items-center gap-x-2 text-lg">
        <span className={`inline-flex items-center gap-2 font-semibold ${phase === 'stage' ? 'text-sub' : ''}`}>
          <span className={`size-2.5 rounded-full ${phase === 'stage' ? 'animate-pulse bg-sub' : 'bg-muted'}`} aria-hidden="true" />
          {phase === 'stage' ? 'On stage now' : 'Stage battle'}
        </span>
        {joined && (
          <>
            <span className="text-muted">,</span>
            <span className="num">{audience}</span>
            <span className="text-muted">{audience === 1 ? 'person' : 'people'} in the room</span>
            {connection !== ConnectionState.Connected && <span className="text-loss">, reconnecting…</span>}
          </>
        )}
      </p>

      {/* ---------- Stage ---------- */}
      <section className="grid justify-items-start gap-3" aria-label="Stage">
        {phase === 'lobby' && (
          <>
            <p className="text-lg text-muted">Stage opens in</p>
            <p className="num text-[clamp(5rem,19vw,11rem)] leading-[0.85] [font-stretch:70%]">{formatClock(startsAt - t)}</p>
            <p className="max-w-[56ch] text-lg">
              Real time, mic to mic. Each battler performs live in turn while everyone listens. Voting stays open{' '}
              {hoursText(votingHours)} after the last round.
            </p>
          </>
        )}

        {phase === 'stage' && (
          <>
            {mySlotNow ? (
              <>
                <p className="text-lg font-semibold text-sub">You’re on. Go.</p>
                <p className="num text-[clamp(5rem,19vw,11rem)] leading-[0.85] [font-stretch:70%]">{formatClock(mySlotNow.end - t)}</p>
                <p className="text-muted">Round {mySlotNow.round}. Your mic closes by itself when the time runs out.</p>
              </>
            ) : current ? (
              <>
                <p className="text-lg text-muted">Now performing, round {current.round}</p>
                <h2 className="handle text-[clamp(2rem,6vw,3.6rem)] leading-none">@{names[current.userId]}</h2>
                <p className="num text-muted">{formatTime((t - current.at) / 1000)} / {formatTime((current.end - current.at) / 1000)}</p>
                {joined && !present.includes(current.userId) && <p className="text-loss">@{names[current.userId]} isn’t in the room.</p>}
              </>
            ) : next ? (
              isMyNext ? (
                <>
                  <p className="text-lg font-semibold">You’re on in</p>
                  <p className="num text-[clamp(5rem,19vw,11rem)] leading-[0.85] text-sub [font-stretch:70%]">{secsToNext}</p>
                  <p className="text-muted">Round {next.round}. Get close to the mic.</p>
                </>
              ) : (
                <>
                  <p className="text-lg text-muted">Up next, round {next.round}</p>
                  <h2 className="handle text-[clamp(2rem,6vw,3.6rem)] leading-none">@{names[next.userId]}</h2>
                  <p className="num text-muted">Starts in {formatClock(next.at - t)}</p>
                </>
              )
            ) : null}
          </>
        )}

        {phase === 'ending' && (
          <>
            <p className="text-[clamp(2rem,6vw,3.6rem)] leading-none font-bold">That’s the battle.</p>
            <p className="text-muted">Voting opens in a moment. Replays appear as soon as each round finishes uploading.</p>
          </>
        )}

        {!joined && phase !== 'ending' && (
          <div className="grid justify-items-start gap-2">
            <button onClick={enter} disabled={connecting} className="rounded-full bg-ink px-7 py-3.5 text-lg text-paper disabled:opacity-60">
              {connecting ? 'Opening the room…' : isPerformer ? 'Enter the stage' : phase === 'stage' ? 'Join and listen' : 'Enter to listen and judge'}
            </button>
            <p className="text-sm text-muted">
              {isPerformer
                ? 'Use headphones, and enter a few minutes early to check your levels. Your mic only opens on your turn.'
                : 'Sound starts after you enter. Headphones or good speakers recommended: there’s a lot of low end.'}
            </p>
          </div>
        )}
        {joined && phase === 'lobby' && (
          <p className="border-t-2 border-sub pt-2 text-lg">{isPerformer ? 'You’re on the stage. Your mic is closed until your turn.' : 'You’re in. Keep this tab open with your sound on.'}</p>
        )}
        {error && <p role="alert" className="text-loss">{error}</p>}
        <p className="sr-only" role="status">
          {mySlotNow ? 'You are on' : current ? `Now performing @${names[current.userId]}` : next ? `Up next @${names[next.userId]}` : ''}
        </p>
      </section>

      {/* ---------- Performer mic check ---------- */}
      {isPerformer && joined && (
        <section className="grid max-w-xl gap-3 rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-xl font-bold [font-stretch:112%]">Your mic</h2>
          {levelBar(currentUserId!)}
          <p className="text-sm text-muted">The bar shows your mic level, so you can check it before the start. It only goes out to the room on your turn, with voice processing off so your bass goes out as it is.</p>
          {rec.warnings.length > 0 && (
            <ul className="grid gap-1 rounded-lg border border-sub/40 bg-sub/5 p-3 text-sm">
              {rec.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
          {uploads.length > 0 && (
            <ul className="grid gap-1 text-sm">
              {uploads.map((u) => (
                <li key={u.round} className={u.state === 'failed' ? 'text-loss' : u.state === 'done' ? 'text-win' : ''}>
                  Round {u.round} replay: {u.state === 'recording' ? 'recording…' : u.state === 'uploading' ? 'uploading…' : u.state === 'done' ? 'saved' : `failed. ${u.message ?? ''}`}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ---------- Running order ---------- */}
      <section className="grid gap-3">
        <h2 className="text-xl font-bold [font-stretch:112%]">Running order</h2>
        <ol className="grid">
          {slots.map((s) => {
            const state = t >= s.end ? 'Done' : t >= s.at ? 'On now' : `in ${formatClock(s.at - t)}`;
            return (
              <li key={s.index} className={`grid grid-cols-[1.75rem_1fr_auto] items-center gap-3 border-b border-line py-3 ${t >= s.at && t < s.end ? 'text-sub' : ''}`}>
                <span className="num text-muted">{s.index + 1}</span>
                <span className="grid gap-1">
                  <span>@{names[s.userId]}, round {s.round}{joined && !present.includes(s.userId) && t < s.end ? <span className="text-muted"> (not in the room)</span> : null}</span>
                  {joined && t >= s.at && t < s.end && s.userId !== currentUserId && levelBar(s.userId)}
                </span>
                <span className="num text-sm text-muted">{state}</span>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
