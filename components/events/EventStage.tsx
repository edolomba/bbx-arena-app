'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionState, LocalAudioTrack, Room, RoomEvent, Track, type RemoteParticipant, type RemoteTrack } from 'livekit-client';
import { createClient } from '@/lib/supabase/client';
import { eventRpc, submitShowcase } from '@/lib/supabase/events';
import { getPlaybackContext } from '@/lib/audio/playback-bus';
import { useServerClock } from '@/hooks/useServerClock';
import { useHiFiRecorder } from '@/hooks/useHiFiRecorder';
import { STAGE_LISTEN_GRACE_MS, STAGE_PUBLISH } from '@/lib/live/stage';
import { formatClock, formatTime } from '@/lib/format';
import type { EventEntry, EventRow } from '@/lib/types';

interface Props {
  event: EventRow;
  entries: EventEntry[];
  performedIds: string[];
  currentUserId: string | null;
}

const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);

/**
 * Live eliminations. The host calls one beatboxer at a time; the call is
 * stored on the event row with server timestamps, so every screen counts down
 * together and a reload lands in the right place. The performer's browser sends
 * the mic live and records the showcase losslessly for the judges.
 */
export default function EventStage({ event, entries, performedIds, currentUserId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const clock = useServerClock();
  const now = clock.now;
  const rec = useHiFiRecorder({ maxSeconds: event.showcase_seconds });

  const isHost = currentUserId === event.host_id;
  const myEntry = entries.find((e) => e.profile_id === currentUserId && e.status === 'registered');
  const isPerformer = !!myEntry;
  const names = Object.fromEntries(entries.map((e) => [e.profile_id, e.profile?.username ?? 'beatboxer']));
  const order = entries.filter((e) => e.status === 'registered').sort((a, b) => (a.stage_order ?? 0) - (b.stage_order ?? 0));

  const [, setTick] = useState(0);
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [audience, setAudience] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState<string | null>(null);
  const [nextSession, setNextSession] = useState('');

  const roomRef = useRef<Room | null>(null);
  const micRef = useRef<LocalAudioTrack | null>(null);
  const audioEls = useRef(new Map<string, HTMLMediaElement>());
  const analysers = useRef(new Map<string, AnalyserNode>());
  const levelRef = useRef<HTMLDivElement | null>(null);
  const recordingKey = useRef<string | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 200);
    return () => window.clearInterval(t);
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
      if (isPerformer) {
        const micError = await rec.prepare();
        if (micError) throw new Error(micError);
      }
      const res = await fetch('/api/livekit/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: event.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'The room couldn’t be opened.');
      const room = new Room({ adaptiveStream: false, dynacast: false });
      roomRef.current = room;
      const count = () => setAudience(room.numParticipants);
      room
        .on(RoomEvent.ConnectionStateChanged, (s) => setConnection(s))
        .on(RoomEvent.ParticipantConnected, count)
        .on(RoomEvent.ParticipantDisconnected, count)
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _p, participant: RemoteParticipant) => {
          if (track.kind !== Track.Kind.Audio) return;
          const el = track.attach();
          el.muted = true;
          document.body.appendChild(el);
          audioEls.current.set(participant.identity, el);
          try {
            const ctx = getPlaybackContext();
            const a = new AnalyserNode(ctx, { fftSize: 1024 });
            new MediaStreamAudioSourceNode(ctx, { mediaStream: new MediaStream([track.mediaStreamTrack]) }).connect(a);
            analysers.current.set(participant.identity, a);
          } catch { /* cosmetic */ }
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _p, participant: RemoteParticipant) => {
          track.detach().forEach((el) => el.remove());
          audioEls.current.delete(participant.identity);
          analysers.current.delete(participant.identity);
        });
      await getPlaybackContext().resume();
      await room.connect(body.url, body.token);
      await room.startAudio();
      count();
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
  }, [event.id, isPerformer, rec]);

  const t = now();
  const start = ms(event.stage_started_at);
  const end = ms(event.stage_ends_at);
  const onStage = event.stage_profile;
  const counting = !!onStage && t < start;
  const performing = !!onStage && t >= start && t < end;
  const audible = !!onStage && t >= start && t < end + STAGE_LISTEN_GRACE_MS ? onStage : null;
  const myTurn = onStage === currentUserId;
  const nextUp = order.find((e) => !performedIds.includes(e.profile_id) && e.profile_id !== onStage);

  useEffect(() => {
    audioEls.current.forEach((el, id) => { el.muted = id !== audible; });
  });

  // Performer: mic open and recording exactly during their showcase.
  useEffect(() => {
    if (!joined || !isPerformer) return;
    const key = myTurn && performing ? `${event.stage_started_at}` : null;
    if (key === recordingKey.current) return;
    if (key) {
      recordingKey.current = key;
      void micRef.current?.unmute();
      void rec.start();
      setUpload('recording');
    } else if (recordingKey.current) {
      recordingKey.current = null;
      void micRef.current?.mute();
      (async () => {
        const take = await rec.stop();
        if (!take || !currentUserId) { setUpload('failed: nothing was recorded'); return; }
        rec.reset();
        setUpload('uploading');
        try {
          await submitShowcase(supabase, event.id, currentUserId, take);
          setUpload('saved');
        } catch (err) {
          setUpload(`failed: ${err instanceof Error ? err.message : ''}`);
        }
      })();
    }
  });

  // Level bar for whoever is on stage (or your own mic before your turn).
  const getLevels = rec.getLevels;
  useEffect(() => {
    let raf = 0;
    const buf = new Float32Array(1024);
    const toBar = (db: number) => Math.max(0, Math.min(1, (db + 60) / 54));
    const loop = () => {
      const bar = levelRef.current;
      if (bar) {
        let db = -100;
        if (myTurn || (isPerformer && !onStage)) {
          db = getLevels()?.rmsDb ?? -100;
        } else if (onStage && analysers.current.has(onStage)) {
          analysers.current.get(onStage)!.getFloatTimeDomainData(buf);
          let s = 0;
          for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
          db = 20 * Math.log10(Math.sqrt(s / buf.length) || 1e-9);
        }
        bar.style.transform = `scaleX(${toBar(db)})`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [getLevels, myTurn, isPerformer, onStage]);

  async function act(fn: string, args: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    try {
      await eventRpc(supabase, fn, { p_event: event.id, ...args });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work.');
    } finally {
      setBusy(false);
    }
  }

  const big = 'num text-[clamp(5rem,19vw,11rem)] leading-[0.85] [font-stretch:70%]';
  const btn = 'rounded-full px-5 py-2.5 disabled:opacity-50';

  return (
    <div className="grid gap-8">
      <p className="flex flex-wrap items-center gap-2 text-lg">
        <span className={`inline-flex items-center gap-2 font-semibold ${event.live ? 'text-sub' : ''}`}>
          <span className={`size-2.5 rounded-full ${event.live ? 'animate-pulse bg-sub' : 'bg-muted'}`} aria-hidden="true" />
          {event.live ? 'Eliminations live' : 'Eliminations paused'}
        </span>
        {joined && <><span className="num">{audience}</span><span className="text-muted">in the room</span></>}
        {joined && connection !== ConnectionState.Connected && <span className="text-loss">reconnecting…</span>}
      </p>

      <section className="grid justify-items-start gap-3" aria-label="Stage">
        {counting && (
          <>
            <p className="text-lg text-muted">{myTurn ? 'You’re on in' : `@${names[onStage!]} is on in`}</p>
            <p className={`${big} text-sub`}>{Math.ceil((start - t) / 1000)}</p>
          </>
        )}
        {performing && (
          myTurn ? (
            <>
              <p className="text-lg font-semibold text-sub">You’re on. Showcase time.</p>
              <p className={big}>{formatClock(end - t)}</p>
            </>
          ) : (
            <>
              <p className="text-lg text-muted">Now performing</p>
              <h2 className="handle text-[clamp(2rem,6vw,3.6rem)] leading-none">@{names[onStage!]}</h2>
              <p className="num text-muted">{formatTime((t - start) / 1000)} / {formatTime((end - start) / 1000)}</p>
            </>
          )
        )}
        {!counting && !performing && (
          <>
            <p className="text-lg text-muted">{event.live ? (nextUp ? 'Next up' : 'Everyone has performed') : 'Paused'}</p>
            <h2 className="handle text-[clamp(2rem,6vw,3.6rem)] leading-none">
              {event.live ? (nextUp ? `@${names[nextUp.profile_id]}` : 'Judges are next') : 'See you next session'}
            </h2>
          </>
        )}
        {joined && (onStage || isPerformer) && (
          <div className="h-2 w-full max-w-xl overflow-hidden rounded-full bg-line" aria-hidden="true">
            <div ref={levelRef} className="h-full origin-left rounded-full bg-sub" style={{ transform: 'scaleX(0)' }} />
          </div>
        )}
        {!joined && (
          <div className="grid justify-items-start gap-2">
            <button onClick={enter} disabled={connecting} className="rounded-full bg-ink px-7 py-3.5 text-lg text-paper disabled:opacity-60">
              {connecting ? 'Opening the room…' : isPerformer ? 'Enter the stage' : 'Enter to listen'}
            </button>
            <p className="text-sm text-muted">
              {isPerformer ? <>Use headphones. Your mic only opens when the host calls you. <a href="/mic-check" target="_blank" className="underline underline-offset-4">Run a mic check</a> first.</> : 'Sound starts after you enter.'}
            </p>
          </div>
        )}
        {upload && <p className={`text-sm ${upload.startsWith('failed') ? 'text-loss' : upload === 'saved' ? 'text-win' : ''}`}>Your showcase: {upload}</p>}
        {error && <p role="alert" className="text-loss">{error}</p>}
      </section>

      {isHost && (
        <section className="grid gap-4 rounded-2xl border-2 border-ink p-5" aria-label="Host controls">
          <h2 className="text-xl font-bold [font-stretch:112%]">Host controls</h2>
          {event.live ? (
            <div className="flex flex-wrap gap-2">
              {!counting && !performing && nextUp && (
                <button disabled={busy} onClick={() => act('host_call_showcase')} className={`${btn} bg-ink text-paper`}>
                  Call @{names[nextUp.profile_id]} to the stage
                </button>
              )}
              {performing && <button disabled={busy} onClick={() => act('host_stop_showcase')} className={`${btn} border border-line`}>Stop showcase now</button>}
              {!counting && !performing && !nextUp && (
                <button disabled={busy} onClick={() => act('host_finish_eliminations')} className={`${btn} bg-sub text-paper`}>
                  Finish eliminations and send to judges
                </button>
              )}
            </div>
          ) : (
            <button disabled={busy} onClick={() => act('host_resume_event')} className={`${btn} justify-self-start bg-ink text-paper`}>Resume the eliminations</button>
          )}

          {event.live && !counting && !performing && (
            <div className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
              <label className="grid gap-1 text-sm">
                <span className="text-muted">Next session (optional)</span>
                <input type="datetime-local" value={nextSession} onChange={(e) => setNextSession(e.target.value)}
                  className="rounded-lg border border-line bg-surface px-3 py-2" />
              </label>
              <button disabled={busy} className={`${btn} border border-line`}
                onClick={() => act('host_pause_event', { p_next_session: nextSession ? new Date(nextSession).toISOString() : null })}>
                Pause for today
              </button>
            </div>
          )}
          <p className="text-sm text-muted">Showcases start 3 seconds after you call, so every screen counts down together. Pausing keeps everything; resume any day.</p>
        </section>
      )}

      <section className="grid gap-3">
        <h2 className="text-xl font-bold [font-stretch:112%]">Running order</h2>
        <ol className="grid">
          {order.map((e, i) => {
            const done = performedIds.includes(e.profile_id);
            const live = e.profile_id === onStage && (counting || performing);
            return (
              <li key={e.profile_id} className={`grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-b border-line py-2.5 ${live ? 'text-sub' : ''}`}>
                <span className="num text-muted">{i + 1}</span>
                <span>@{e.profile?.username}</span>
                <span className="flex items-center gap-3 text-sm text-muted">
                  {live ? 'On now' : done ? 'Done' : ''}
                  {isHost && event.live && (done || e.profile_id === onStage) && !counting && !performing && (
                    <button disabled={busy} onClick={() => act('host_call_showcase', { p_profile: e.profile_id })} className="underline underline-offset-4">Redo</button>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
