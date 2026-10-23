'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { submitTake } from '@/lib/supabase/battles';
import { audioUrl } from '@/lib/supabase/storage';
import { announcePlay, dbToGain, getPlaybackContext } from '@/lib/audio/playback-bus';
import { drawWaveform } from '@/lib/audio/draw';
import { useServerClock } from '@/hooks/useServerClock';
import AudioRecorder from '@/components/audio/AudioRecorder';
import { formatClock, formatTime, intervalHours } from '@/lib/format';
import { LIVE_GAP_MS, LIVE_INTRO_MS } from '@/lib/constants';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { BattleWithPlayers, PreparedTake, Submission } from '@/lib/types';

interface Props {
  battle: BattleWithPlayers;
  submissions: Submission[];
  currentUserId: string | null;
  /** Adds heard time (as a fraction of the round) so live listening unlocks voting. */
  onHeard: (submissionId: string, fraction: number) => void;
}

interface Slot {
  sub: Submission;
  username: string;
  at: number;
  dur: number;
}

/**
 * A live premiere. Everyone's browser schedules the same rounds against the
 * database clock, so the room hears each round at the same moment. Audio is
 * decoded and played through Web Audio after the visitor taps "Enter", which
 * is the user gesture browsers require before sound can start on its own.
 */
export default function LiveRoom({ battle, submissions, currentUserId, onHeard }: Props) {
  const { t: dict } = useI18n();
  const tl = dict.live;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const clock = useServerClock();
  const now = clock.now;
  const [, setTick] = useState(0);
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audience, setAudience] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startsAt = new Date(battle.starts_at!).getTime();
  const players = { [battle.challenger_id]: battle.challenger.username, [battle.opponent_id ?? '']: battle.opponent?.username ?? '' };
  const isParticipant = currentUserId === battle.challenger_id || currentUserId === battle.opponent_id;
  const mySubmitted = submissions.some((s) => s.user_id === currentUserId);
  const votingHours = intervalHours(battle.voting_window);

  // Same order and spacing as advance_battle() in the database.
  const schedule: Slot[] = useMemo(() => {
    const order = [battle.challenger_id, battle.opponent_id];
    const slots: Slot[] = [];
    let t = startsAt + LIVE_INTRO_MS;
    for (const uid of order) {
      const sub = submissions.find((s) => s.user_id === uid);
      if (!sub) return [];
      slots.push({ sub, username: players[uid ?? ''], at: t, dur: sub.duration_ms });
      t += sub.duration_ms + LIVE_GAP_MS;
    }
    return slots;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions, startsAt, battle.challenger_id, battle.opponent_id]);

  const phase: 'lobby' | 'starting' | 'live' =
    battle.status === 'live' && schedule.length === 2 ? 'live' : now() < startsAt ? 'lobby' : 'starting';

  // Re-render a few times a second for the countdown and the stage.
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 200);
    return () => window.clearInterval(t);
  }, []);

  // Room presence: how many people have this battle open.
  useEffect(() => {
    const key = currentUserId ?? `guest-${crypto.randomUUID()}`;
    const channel = supabase.channel(`room:${battle.id}`, { config: { presence: { key } } });
    channel
      .on('presence', { event: 'sync' }, () => setAudience(Object.keys(channel.presenceState()).length))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void channel.track({ at: Date.now() });
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, battle.id, currentUserId]);

  // Load and schedule the rounds once the battle is live and the visitor is in.
  useEffect(() => {
    if (phase !== 'live' || !joined || !clock.synced) return;
    let cancelled = false;
    const sources: AudioBufferSourceNode[] = [];
    const ctx = getPlaybackContext();
    const master = new GainNode(ctx, { gain: muted ? 0 : 1 });
    master.connect(ctx.destination);
    masterRef.current = master;

    (async () => {
      try {
        const remaining = schedule.filter((s) => s.at + s.dur > now());
        const buffers = await Promise.all(
          remaining.map(async (s) => {
            const res = await fetch(audioUrl(s.sub.stream_path ?? s.sub.audio_path));
            if (!res.ok) throw new Error('A round didn’t load.');
            return ctx.decodeAudioData(await res.arrayBuffer());
          }),
        );
        if (cancelled) return;
        if (ctx.state !== 'running') await ctx.resume();
        const lufs = schedule.map((s) => s.sub.integrated_lufs).filter((x): x is number => x != null);
        const target = lufs.length > 1 ? Math.min(...lufs) : null;
        const t = now();
        remaining.forEach((slot, i) => {
          const src = new AudioBufferSourceNode(ctx, { buffer: buffers[i] });
          const gainDb = target != null && slot.sub.integrated_lufs != null ? target - slot.sub.integrated_lufs : 0;
          src.connect(new GainNode(ctx, { gain: dbToGain(gainDb) })).connect(master);
          if (t >= slot.at) src.start(0, (t - slot.at) / 1000);
          else src.start(ctx.currentTime + (slot.at - t) / 1000);
          sources.push(src);
        });
      } catch {
        if (!cancelled) setLoadError(tl.loadFailed);
      }
    })();

    return () => {
      cancelled = true;
      sources.forEach((s) => {
        try { s.stop(); } catch { /* already stopped */ }
      });
      master.disconnect();
      masterRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, joined, clock.synced, schedule]);

  useEffect(() => {
    masterRef.current?.gain.setTargetAtTime(muted ? 0 : 1, getPlaybackContext().currentTime, 0.02);
  }, [muted]);

  // Count live listening toward the "listen before you vote" rule.
  const lastRef = useRef(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => {
      const wall = Date.now();
      const dt = wall - lastRef.current;
      lastRef.current = wall;
      if (phase !== 'live' || !joined || muted) return;
      const n = now();
      const cur = schedule.find((s) => n >= s.at && n < s.at + s.dur);
      if (cur) onHeard(cur.sub.id, dt / cur.dur);
    }, 250);
    return () => window.clearInterval(t);
  }, [phase, joined, muted, schedule, now, onHeard]);

  const enter = useCallback(async () => {
    announcePlay('live-room');
    try { await getPlaybackContext().resume(); } catch { /* resumes on next gesture */ }
    setJoined(true);
  }, []);

  const handleSubmit = useCallback(async (take: PreparedTake) => {
    if (!currentUserId) throw new Error(tl.loginToSubmit);
    await submitTake(supabase, battle.id, currentUserId, take);
    router.refresh();
  }, [supabase, battle.id, currentUserId, router]);

  const t = now();
  const cur = schedule.find((s) => t >= s.at && t < s.at + s.dur);
  const next = schedule.find((s) => t < s.at);

  useEffect(() => {
    const canvas = canvasRef.current;
    const slot = cur ?? next;
    if (canvas && slot) drawWaveform(canvas, slot.sub.waveform_data, cur ? (t - cur.at) / cur.dur : 0);
  });

  const lineup = [
    { uid: battle.challenger_id, name: battle.challenger.username },
    { uid: battle.opponent_id, name: battle.opponent?.username ?? '' },
  ];

  return (
    <div className="grid gap-10">
      <p className="flex flex-wrap items-center gap-x-2 text-lg">
        <span className={`inline-flex items-center gap-2 font-semibold ${phase === 'live' ? 'text-sub' : ''}`}>
          <span className={`size-2.5 rounded-full ${phase === 'live' ? 'animate-pulse bg-sub' : 'bg-muted'}`} aria-hidden="true" />
          {phase === 'live' ? tl.liveNow : tl.liveBattle}
        </span>
        <span className="text-muted">,</span>
        <span className="num">{audience}</span>
        <span className="text-muted">{audience === 1 ? 'person' : 'people'} in the room</span>
      </p>

      {phase === 'lobby' && (
        <section className="grid justify-items-start gap-3" aria-label={tl.countdown}>
          <p className="text-lg text-muted">{tl.startsIn}</p>
          <p className="num text-[clamp(5rem,19vw,11rem)] leading-[0.85] [font-stretch:70%]" suppressHydrationWarning>
            {formatClock(startsAt - t)}
          </p>
          <p className="max-w-[54ch] text-lg">
            {tl.intro(dict.battle.hours(votingHours))}
          </p>
          {joined ? (
            <p className="border-t-2 border-sub pt-2 text-lg">{tl.youreIn}</p>
          ) : (
            <button onClick={enter} className="rounded-full bg-ink px-7 py-3.5 text-lg text-paper">
              {isParticipant ? tl.enterRoom : tl.enterJudge}
            </button>
          )}
        </section>
      )}

      {phase === 'starting' && (
        <section className="grid gap-2">
          <p className="text-[clamp(2rem,6vw,3.6rem)] leading-none font-bold">{tl.starting}</p>
          <p className="text-muted">{tl.loading}</p>
          {!joined && (
            <button onClick={enter} className="justify-self-start rounded-full bg-ink px-7 py-3.5 text-lg text-paper">
              {tl.enterJudge}
            </button>
          )}
        </section>
      )}

      {phase === 'live' && (
        <section className="grid justify-items-start gap-3" aria-label={dict.stage.stage}>
          <p className="text-lg text-muted">{cur ? tl.nowPlaying : next ? tl.upNext : tl.lastRound}</p>
          <h2 className="handle text-[clamp(2rem,6vw,3.6rem)] leading-none">
            {cur ? `@${cur.username}` : next ? `@${next.username}` : tl.votingOpens}
          </h2>
          <canvas ref={canvasRef} className="block h-24 w-full" aria-hidden="true" />
          <p className="num text-muted">
            {cur ? `${formatTime((t - cur.at) / 1000)} / ${formatTime(cur.dur / 1000)}` : next ? tl.startsInClock(formatClock(next.at - t)) : ''}
          </p>
          {joined ? (
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => setMuted((m) => !m)} aria-pressed={muted} className="rounded-full border border-line px-5 py-2.5">
                {muted ? tl.unmute : tl.mute}
              </button>
              <span className="text-sm text-muted">{tl.levelsMatched}</span>
            </div>
          ) : (
            <div className="grid justify-items-start gap-2">
              <button onClick={enter} className="rounded-full bg-ink px-7 py-3.5 text-lg text-paper">{tl.joinNow}</button>
              <p className="text-sm text-muted">{tl.hearRest}</p>
            </div>
          )}
          {loadError && <p role="alert" className="text-loss">{loadError}</p>}
          <p className="sr-only" role="status">{cur ? tl.srNow(cur.username) : next ? tl.srNext(next.username) : ''}</p>
        </section>
      )}

      <section className="grid gap-3">
        <h2 className="text-xl font-bold [font-stretch:112%]">{dict.stage.runningOrder}</h2>
        <ol className="grid">
          {lineup.map((p, i) => {
            const slot = schedule.find((s) => s.sub.user_id === p.uid);
            let state = '';
            if (phase === 'live' && slot) state = t >= slot.at + slot.dur ? tl.played : t >= slot.at ? tl.playingNow : tl.startsInClock(formatClock(slot.at - t));
            else if (p.uid === currentUserId) state = mySubmitted ? tl.roundIn : tl.waitingRound;
            return (
              <li key={p.uid ?? i} className="grid grid-cols-[1.75rem_1fr_auto] items-baseline gap-3 border-b border-line py-3">
                <span className="num text-muted">{i + 1}</span>
                <span>{tl.slot(p.name)}</span>
                <span className="num text-sm text-muted">{state}</span>
              </li>
            );
          })}
        </ol>
        {phase === 'lobby' && <p className="text-sm text-muted">{tl.roundsIn(battle.turn_number)}</p>}
      </section>

      {phase === 'lobby' && isParticipant && !mySubmitted && battle.format !== 'tag' && (
        <section className="grid gap-3">
          <h2 className="text-xl font-bold [font-stretch:112%]">{tl.yourRound}</h2>
          <p>{tl.getItIn}</p>
          <AudioRecorder maxSeconds={battle.round_duration_seconds} onSubmit={handleSubmit} submitLabel={tl.lockIn} />
        </section>
      )}
    </div>
  );
}
