'use client';

import { useI18n } from '@/components/i18n/I18nProvider';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { WaveformData } from '@/lib/types';
import { announcePlay, dbToGain, getPlaybackContext, onOtherPlay } from '@/lib/audio/playback-bus';
import { formatTime } from '@/lib/format';

interface Props {
  src: string;
  waveform: WaveformData;
  durationMs?: number;
  /** Attenuate-only level matching from the battle view. 0 = untouched. */
  gainDb?: number;
  compact?: boolean;
  /** Used in accessible names: "Play @handle round 1". */
  label?: string;
  /** Fraction of the clip actually heard (seeking ahead doesn't count). */
  onListenProgress?: (fraction: number) => void;
}

const BAR = 2;
const GAP = 1;

function cssVar(el: Element, name: string, fallback: string) {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

/** Downsample peaks to the number of bars that fit, keeping maxima. */
function resample(src: number[], n: number): Float32Array {
  const out = new Float32Array(n);
  if (!src.length) return out;
  const ratio = src.length / n;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.max(a + 1, Math.floor((i + 1) * ratio));
    let m = 0;
    for (let j = a; j < b && j < src.length; j++) if (src[j] > m) m = src[j];
    out[i] = m;
  }
  return out;
}

/**
 * Plays through a plain <audio> element (streams, seeks, low memory) and draws
 * precomputed peaks on a canvas. The full-band waveform is drawn in the signal
 * colour; the < 100 Hz band is drawn inside it in the sub colour, so listeners
 * can literally see a lip bass. Audio is routed through Web Audio only when a
 * gain change is needed, and even then only through a single GainNode: no
 * compressor, limiter or EQ ever touches playback.
 */
export default function WaveformPlayer({
  src,
  waveform,
  durationMs,
  gainDb = 0,
  compact = false,
  label,
  onListenProgress,
}: Props) {
  const { t } = useI18n();
  const id = useId();
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const graphRef = useRef<{ gain: GainNode } | null>(null);
  const rafRef = useRef(0);
  const heardRef = useRef(0);
  const lastTimeRef = useRef(0);
  const reportedRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [second, setSecond] = useState(0);
  const [duration, setDuration] = useState((durationMs ?? 0) / 1000);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const n = Math.max(1, Math.floor(w / (BAR + GAP)));
    const full = resample(waveform.full, n);
    const low = resample(waveform.low, n);
    const signal = cssVar(canvas, '--wave-signal', '#2944F0');
    const sub = cssVar(canvas, '--wave-sub', '#D81B72');
    const rest = cssVar(canvas, '--wave-rest', '#9EA3C0');

    const audio = audioRef.current;
    const d = audio?.duration && Number.isFinite(audio.duration) ? audio.duration : duration;
    const playedBars = d ? ((audio?.currentTime ?? 0) / d) * n : 0;
    const mid = h / 2;
    const usable = h - 2;

    for (let i = 0; i < n; i++) {
      const x = i * (BAR + GAP);
      const played = i < playedBars;
      const fh = Math.max(1, full[i] * usable);
      g.globalAlpha = played ? 1 : 0.6;
      g.fillStyle = played ? signal : rest;
      g.fillRect(x, mid - fh / 2, BAR, fh);

      const lh = low[i] * usable;
      if (lh > 0.75) {
        g.globalAlpha = played ? 1 : 0.55;
        g.fillStyle = sub;
        g.fillRect(x, mid - lh / 2, BAR, lh);
      }
    }
    g.globalAlpha = 1;
  }, [waveform, duration]);

  // Redraw on resize and on light/dark switches.
  useEffect(() => {
    draw();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', draw);
    return () => {
      ro.disconnect();
      mq.removeEventListener('change', draw);
    };
  }, [draw]);

  useEffect(() => onOtherPlay(id, () => audioRef.current?.pause()), [id]);

  const ensureGraph = useCallback(() => {
    if (graphRef.current || !audioRef.current) return;
    const ctx = getPlaybackContext();
    const source = ctx.createMediaElementSource(audioRef.current);
    const gain = new GainNode(ctx, { gain: dbToGain(gainDb) });
    source.connect(gain).connect(ctx.destination);
    graphRef.current = { gain };
  }, [gainDb]);

  useEffect(() => {
    if (graphRef.current) {
      graphRef.current.gain.gain.setTargetAtTime(dbToGain(gainDb), getPlaybackContext().currentTime, 0.02);
    } else if (gainDb !== 0 && playing) {
      ensureGraph();
      void getPlaybackContext().resume();
    }
  }, [gainDb, playing, ensureGraph]);

  const tick = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    const t = a.currentTime;
    const delta = t - lastTimeRef.current;
    if (delta > 0 && delta < 0.5) heardRef.current += delta; // ignore seeks
    lastTimeRef.current = t;
    setSecond(Math.floor(t));
    if (onListenProgress && a.duration) {
      const fraction = Math.min(1, heardRef.current / a.duration);
      if (fraction - reportedRef.current >= 0.05 || (fraction === 1 && reportedRef.current < 1)) {
        reportedRef.current = fraction;
        onListenProgress(fraction);
      }
    }
    draw();
    rafRef.current = requestAnimationFrame(tick);
  }, [draw, onListenProgress]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (!a.paused) {
      a.pause();
      return;
    }
    if (gainDb !== 0 || graphRef.current) {
      ensureGraph();
      await getPlaybackContext().resume();
    }
    announcePlay(id);
    try {
      await a.play();
    } catch {
      /* autoplay rejection or aborted load: the button stays in "play" */
    }
  };

  const seekTo = (fraction: number) => {
    const a = audioRef.current;
    const d = a?.duration && Number.isFinite(a.duration) ? a.duration : duration;
    if (!a || !d) return;
    a.currentTime = Math.max(0, Math.min(d, fraction * d));
    lastTimeRef.current = a.currentTime;
    setSecond(Math.floor(a.currentTime));
    draw();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seekTo((e.clientX - rect.left) / rect.width);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const step = 5 / duration;
    const now = a.currentTime / duration;
    if (e.key === 'ArrowRight') seekTo(now + step);
    else if (e.key === 'ArrowLeft') seekTo(now - step);
    else if (e.key === 'Home') seekTo(0);
    else if (e.key === 'End') seekTo(1);
    else return;
    e.preventDefault();
  };

  const name = label ?? 'audio';

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? t.player.pause(name) : t.player.play(name)}
        className={`grid shrink-0 place-items-center rounded-full bg-ink text-paper outline-offset-2 focus-visible:outline-2 focus-visible:outline-signal ${
          compact ? 'size-9' : 'size-12'
        }`}
      >
        {playing ? (
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
            <rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
            <rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="size-4 translate-x-px" aria-hidden="true">
            <path d="M4 2.5v11a.5.5 0 0 0 .77.42l8.5-5.5a.5.5 0 0 0 0-.84l-8.5-5.5A.5.5 0 0 0 4 2.5Z" fill="currentColor" />
          </svg>
        )}
      </button>

      <div
        role="slider"
        tabIndex={0}
        aria-label={t.player.seek(name)}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={second}
        aria-valuetext={`${formatTime(second)} of ${formatTime(duration)}`}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        className="min-w-0 flex-1 cursor-pointer touch-none rounded-sm outline-offset-4 focus-visible:outline-2 focus-visible:outline-signal"
      >
        <canvas ref={canvasRef} className={`block w-full ${compact ? 'h-9' : 'h-20'}`} />
      </div>

      <span className="num shrink-0 text-sm text-muted">
        {compact ? formatTime(duration - second) : `${formatTime(second)} / ${formatTime(duration)}`}
      </span>

      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        crossOrigin="anonymous"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setDuration(d);
        }}
        onPlay={() => {
          setPlaying(true);
          lastTimeRef.current = audioRef.current?.currentTime ?? 0;
          cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(tick);
        }}
        onPause={() => {
          setPlaying(false);
          cancelAnimationFrame(rafRef.current);
          draw();
        }}
        onEnded={() => {
          setPlaying(false);
          cancelAnimationFrame(rafRef.current);
          tick();
          cancelAnimationFrame(rafRef.current);
        }}
      />
    </div>
  );
}
