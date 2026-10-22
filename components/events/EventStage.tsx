'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionState, LocalAudioTrack, Room, RoomEvent, Track, type RemoteParticipant, type RemoteTrack } from 'livekit-client';
import { createClient } from '@/lib/supabase/client';
import { eventRpc, submitShowcase } from '@/lib/supabase/events';
import { getPlaybackContext } from '@/lib/audio/playback-bus';
import { useServerClock } from '@/hooks/useServerClock';
import { useHiFiRecorder } from '@/hooks/useHiFiRecorder';
import VoiceControls, { type RoomRole } from '@/components/live/VoiceControls';
import { STAGE_LISTEN_GRACE_MS, STAGE_PUBLISH } from '@/lib/live/stage';
import { formatClock, formatTime } from '@/lib/format';
import { useI18n } from '@/components/i18n/I18nProvider';
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
  const { t: all } = useI18n();
  const tv = all.evp;
  const ts = all.stage;
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
  const [liveRoom, setLiveRoom] = useState<Room | null>(null);
  const [myRole, setMyRole] = useState<RoomRole>('audience');
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
      if (!res.ok) throw new Error(body.error ?? ts.roomFailed);
      const room = new Room({ adaptiveStream: false, dynacast: false });
      roomRef.current = room;
      setLiveRoom(room);
      if (body.role) setMyRole(body.role as RoomRole);
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
        if (!source) throw new Error(ts.micFailed);
        const mic = new LocalAudioTrack(source.clone(), undefined, true);
        await mic.mute();
        await room.localParticipant.publishTrack(mic, { source: Track.Source.Microphone, ...STAGE_PUBLISH });
        micRef.current = mic;
      }
      setJoined(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : ts.roomFailed);
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
  const roundWindow = !!onStage && t < end + STAGE_LISTEN_GRACE_MS;
  const myTurn = onStage === currentUserId;
  const nextUp = order.find((e) => !performedIds.includes(e.profile_id) && e.profile_id !== onStage);

  useEffect(() => {
    // Outside a showcase everyone who talks is heard; during one, only the beatboxer on stage.
    audioEls.current.forEach((el, id) => { el.muted = roundWindow ? id !== audible : false; });
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
      setUpload(ts.recording);
    } else if (recordingKey.current) {
      recordingKey.current = null;
      // The voice panel puts the mic back the way the beatboxer had it.
      (async () => {
        const take = await rec.stop();
        if (!take || !currentUserId) { setUpload(ts.failed(tv.nothingRecorded)); return; }
        rec.reset();
        setUpload(ts.uploading);
        try {
          await submitShowcase(supabase, event.id, currentUserId, take);
          setUpload(ts.saved);
        } catch (err) {
          setUpload(ts.failed(err instanceof Error ? err.message : ''));
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
      setError(err instanceof Error ? err.message : tv.failed);
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
          {event.live ? tv.elimsLive : tv.elimsPaused}
        </span>
        {joined && <><span className="num">{audience}</span><span className="text-muted">{tv.inRoom}</span></>}
        {joined && connection !== ConnectionState.Connected && <span className="text-loss">{ts.reconnecting}</span>}
      </p>

      <section className="grid justify-items-start gap-3" aria-label={ts.stage}>
        {counting && (
          <>
            <p className="text-lg text-muted">{myTurn ? ts.youreOnIn : ts.isOnIn(names[onStage!])}</p>
            <p className={`${big} text-sub`}>{Math.ceil((start - t) / 1000)}</p>
          </>
        )}
        {performing && (
          myTurn ? (
            <>
              <p className="text-lg font-semibold text-sub">{tv.showcaseTime}</p>
              <p className={big}>{formatClock(end - t)}</p>
            </>
          ) : (
            <>
              <p className="text-lg text-muted">{tv.nowPerforming}</p>
              <h2 className="handle text-[clamp(2rem,6vw,3.6rem)] leading-none">@{names[onStage!]}</h2>
              <p className="num text-muted">{formatTime((t - start) / 1000)} / {formatTime((end - start) / 1000)}</p>
            </>
          )
        )}
        {!counting && !performing && (
          <>
            <p className="text-lg text-muted">{event.live ? (nextUp ? ts.nextUp : tv.everyoneDone) : tv.paused}</p>
            <h2 className="handle text-[clamp(2rem,6vw,3.6rem)] leading-none">
              {event.live ? (nextUp ? `@${names[nextUp.profile_id]}` : tv.judgesNext) : tv.seeYou}
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
              {connecting ? ts.opening : isPerformer ? ts.enterStage : ts.enterListen}
            </button>
            <p className="text-sm text-muted">
              {isPerformer ? <>{tv.performerHint} <a href="/mic-check" target="_blank" className="underline underline-offset-4">{ts.runMicCheck}</a> {ts.first}</> : tv.listenerHint}
            </p>
          </div>
        )}
        {upload && <p className={`text-sm ${upload.startsWith(ts.failed('').trim()) ? 'text-loss' : upload === ts.saved ? 'text-win' : ''}`}>{tv.yourShowcase(upload)}</p>}
        {error && <p role="alert" className="text-loss">{error}</p>}
      </section>

      {isHost && (
        <section className="grid gap-4 rounded-2xl border-2 border-ink p-5" aria-label={ts.hostControls}>
          <h2 className="text-xl font-bold [font-stretch:112%]">{ts.hostControls}</h2>
          {event.live ? (
            <div className="flex flex-wrap gap-2">
              {!counting && !performing && nextUp && (
                <button disabled={busy} onClick={() => act('host_call_showcase')} className={`${btn} bg-ink text-paper`}>
                  {tv.call(names[nextUp.profile_id])}
                </button>
              )}
              {performing && <button disabled={busy} onClick={() => act('host_stop_showcase')} className={`${btn} border border-line`}>{tv.stopShowcase}</button>}
              {!counting && !performing && !nextUp && (
                <button disabled={busy} onClick={() => act('host_finish_eliminations')} className={`${btn} bg-sub text-paper`}>
                  {tv.finishElims}
                </button>
              )}
            </div>
          ) : (
            <button disabled={busy} onClick={() => act('host_resume_event')} className={`${btn} justify-self-start bg-ink text-paper`}>{tv.resumeElims}</button>
          )}

          {event.live && !counting && !performing && (
            <div className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
              <label className="grid gap-1 text-sm">
                <span className="text-muted">{tv.nextSessionOpt}</span>
                <input type="datetime-local" value={nextSession} onChange={(e) => setNextSession(e.target.value)}
                  className="rounded-lg border border-line bg-surface px-3 py-2" />
              </label>
              <button disabled={busy} className={`${btn} border border-line`}
                onClick={() => act('host_pause_event', { p_next_session: nextSession ? new Date(nextSession).toISOString() : null })}>
                {tv.pauseToday}
              </button>
            </div>
          )}
          <p className="text-sm text-muted">{tv.stageHint}</p>
        </section>
      )}

      {joined && (
        <VoiceControls room={liveRoom} role={myRole} kind="event" roomId={event.id}
          roundActive={roundWindow} myRoundLive={myTurn && performing}
          performerMic={isPerformer ? micRef.current : null} publishOptions={STAGE_PUBLISH} />
      )}

      <section className="grid gap-3">
        <h2 className="text-xl font-bold [font-stretch:112%]">{ts.runningOrder}</h2>
        <ol className="grid">
          {order.map((e, i) => {
            const done = performedIds.includes(e.profile_id);
            const live = e.profile_id === onStage && (counting || performing);
            return (
              <li key={e.profile_id} className={`grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-b border-line py-2.5 ${live ? 'text-sub' : ''}`}>
                <span className="num text-muted">{i + 1}</span>
                <span>@{e.profile?.username}</span>
                <span className="flex items-center gap-3 text-sm text-muted">
                  {live ? ts.onNow : done ? ts.done : ''}
                  {isHost && event.live && (done || e.profile_id === onStage) && !counting && !performing && (
                    <button disabled={busy} onClick={() => act('host_call_showcase', { p_profile: e.profile_id })} className="underline underline-offset-4">{tv.redo}</button>
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
