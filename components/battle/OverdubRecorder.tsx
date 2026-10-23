'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { RECORDER_WORKLET_SOURCE } from '@/lib/audio/recorder-worklet';
import { mergeChunks } from '@/lib/audio/wav';
import { encodeTakeFlac } from '@/lib/audio/encode';
import { analyzeAudio } from '@/lib/audio/analyze';
import type { PreparedTake } from '@/lib/types';

type Phase = 'idle' | 'arming' | 'countdown' | 'recording' | 'processing' | 'review' | 'error';
const COUNT_IN = 1.5; // seconds between pressing start and the part starting

/**
 * Tag Team second layer: plays the partner's first part in the headphones and
 * records the mic over it. A second, internal channel records a "start marker"
 * that switches on in the very same audio frame the part starts, so the take
 * lines up with the part to the sample; the device's own delay (output +
 * input) is then subtracted, and a fine-tune slider handles what's left.
 */
export default function OverdubRecorder({ partUrl, maxSeconds, onSubmit }: {
  partUrl: string; maxSeconds: number; onSubmit: (take: PreparedTake) => Promise<void>;
}) {
  const t = useI18n().t.tag;
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [latencyMs, setLatencyMs] = useState(0);
  const [nudgeMs, setNudgeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const markerRef = useRef<ConstantSourceNode | null>(null);
  const partRef = useRef<AudioBuffer | null>(null);
  const partSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const chunksRef = useRef<Float32Array[][]>([]);
  const stoppedRef = useRef<(() => void) | null>(null);
  const takeRef = useRef<{ mic: Float32Array; start: number } | null>(null);
  const previewRef = useRef<AudioBufferSourceNode | null>(null);
  const timerRef = useRef<number | null>(null);

  const cleanup = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    try { partSrcRef.current?.stop(); } catch { /* not started */ }
    try { previewRef.current?.stop(); } catch { /* not started */ }
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
  };
  useEffect(() => cleanup, []);

  async function arm() {
    setError('');
    setPhase('arming');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 }, sampleRate: { ideal: 48000 } } as MediaTrackConstraints,
        video: false,
      });
      streamRef.current = stream;
      const settings = stream.getAudioTracks()[0].getSettings() as MediaTrackSettings & { latency?: number };
      const ctx = new AudioContext(settings.sampleRate ? { sampleRate: settings.sampleRate, latencyHint: 'interactive' } : { latencyHint: 'interactive' });
      ctxRef.current = ctx;

      const res = await fetch(partUrl);
      partRef.current = await ctx.decodeAudioData(await res.arrayBuffer());

      const url = URL.createObjectURL(new Blob([RECORDER_WORKLET_SOURCE], { type: 'application/javascript' }));
      try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }

      // channel 0: the mic, channel 1: the start marker (0 before the part starts, 1 from that frame on)
      const merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
      ctx.createMediaStreamSource(stream).connect(merger, 0, 0);
      const marker = new ConstantSourceNode(ctx, { offset: 1 });
      marker.connect(merger, 0, 1);
      markerRef.current = marker;
      const node = new AudioWorkletNode(ctx, 'bbx-recorder', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 2,
        channelCountMode: 'explicit', channelInterpretation: 'discrete', processorOptions: { batchFrames: 4096 },
      });
      node.port.onmessage = (e: MessageEvent) => {
        const msg = e.data as { type: 'chunk'; chans: Float32Array[] } | { type: 'stopped' };
        if (msg.type === 'chunk') chunksRef.current.push(msg.chans);
        else { stoppedRef.current?.(); stoppedRef.current = null; }
      };
      merger.connect(node).connect(new GainNode(ctx, { gain: 0 })).connect(ctx.destination);
      nodeRef.current = node;

      // what the browser reports for playback + capture delay
      const out = (ctx as AudioContext & { outputLatency?: number }).outputLatency || ctx.baseLatency || 0;
      const lat = Math.min(0.5, Math.max(0, out + (settings.latency ?? 0)));
      setLatencyMs(Math.round(lat * 1000));
      await ctx.resume();
      void begin(ctx, node, marker);
    } catch {
      setError(t.failed);
      setPhase('error');
      cleanup();
    }
  }

  async function begin(ctx: AudioContext, node: AudioWorkletNode, marker: ConstantSourceNode) {
    chunksRef.current = [];
    node.port.postMessage({ type: 'start' });
    setPhase('countdown');
    const part = partRef.current!;
    const t0 = ctx.currentTime + COUNT_IN;
    const src = new AudioBufferSourceNode(ctx, { buffer: part });
    src.connect(ctx.destination);
    src.start(t0);
    marker.start(t0);
    partSrcRef.current = src;
    timerRef.current = window.setTimeout(() => setPhase('recording'), COUNT_IN * 1000);
    // stop on its own a moment after the part ends
    const total = Math.min(part.duration, maxSeconds) + COUNT_IN + 0.6;
    window.setTimeout(() => { void stop(); }, total * 1000);
  }

  async function stop() {
    const node = nodeRef.current, ctx = ctxRef.current;
    if (!node || !ctx || takeRef.current) return;
    setPhase('processing');
    await new Promise<void>((resolve) => { stoppedRef.current = resolve; node.port.postMessage({ type: 'stop' }); });
    try { partSrcRef.current?.stop(); } catch { /* ended */ }
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    const chans = mergeChunks(chunksRef.current, Math.floor((maxSeconds + COUNT_IN + 2) * ctx.sampleRate));
    const mark = chans[1];
    let k = -1;
    for (let i = 0; i < mark.length; i++) if (mark[i] > 0.5) { k = i; break; }
    if (k < 0) { setError(t.failed); setPhase('error'); return; }
    takeRef.current = { mic: chans[0], start: k };
    setPhase('review');
  }

  /** Part + the aligned mic layer, as stereo channels (normalised only if the sum would clip). */
  function mixChannels(): Float32Array[] {
    const ctx = ctxRef.current!, part = partRef.current!, take = takeRef.current!;
    const sr = ctx.sampleRate;
    const n = Math.min(part.length, Math.floor(maxSeconds * sr));
    // the take lags the part by the device delay; a positive nudge moves the layer later
    const offset = take.start + Math.round(((latencyMs - nudgeMs) / 1000) * sr);
    const pl = part.getChannelData(0), pr = part.numberOfChannels > 1 ? part.getChannelData(1) : pl;
    const L = new Float32Array(n), R = new Float32Array(n);
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const j = offset + i;
      const m = j >= 0 && j < take.mic.length ? take.mic[j] : 0;
      L[i] = pl[i] + m; R[i] = pr[i] + m;
      peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    }
    if (peak > 0.999) { const g = 0.999 / peak; for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; } }
    return [L, R];
  }

  function toBuffer(ch: Float32Array[]) {
    const ctx = ctxRef.current!;
    const buf = ctx.createBuffer(2, ch[0].length, ctx.sampleRate);
    buf.copyToChannel(ch[0] as Float32Array<ArrayBuffer>, 0);
    buf.copyToChannel(ch[1] as Float32Array<ArrayBuffer>, 1);
    return buf;
  }

  function listen() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (playing) { try { previewRef.current?.stop(); } catch { /* ended */ } setPlaying(false); return; }
    const src = new AudioBufferSourceNode(ctx, { buffer: toBuffer(mixChannels()) });
    src.connect(ctx.destination);
    src.onended = () => setPlaying(false);
    src.start();
    previewRef.current = src;
    setPlaying(true);
  }

  async function submit() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    setBusy(true);
    setError('');
    try {
      try { previewRef.current?.stop(); } catch { /* ended */ }
      const ch = mixChannels();
      const [blob, analysis] = await Promise.all([encodeTakeFlac(ch, ctx.sampleRate, 24), analyzeAudio(toBuffer(ch))]);
      await onSubmit({ blob, fileExt: 'flac', contentType: 'audio/flac', analysis, sourceCodec: 'flac', isLossless: true, sampleRate: ctx.sampleRate, bitDepth: 24, channels: 2 });
    } catch (e) {
      setError(e instanceof Error ? e.message : t.failed);
      setBusy(false);
    }
  }

  function retry() {
    takeRef.current = null;
    setNudgeMs(0);
    setPlaying(false);
    cleanup();
    void arm();
  }

  return (
    <div className="grid gap-4 rounded-2xl border border-line bg-surface p-5">
      <p className="text-sm text-muted">🎧 {t.headphones}</p>
      {phase === 'idle' || phase === 'error' ? (
        <button onClick={arm} className="justify-self-start rounded-full bg-ink px-6 py-3 text-paper">{t.start}</button>
      ) : phase === 'arming' || phase === 'countdown' ? (
        <p className="text-lg font-semibold text-gold">{t.getReady}</p>
      ) : phase === 'recording' ? (
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-2 text-lg font-semibold text-loss"><span className="size-3 animate-pulse rounded-full bg-loss" aria-hidden="true" />{t.recording}</span>
          <button onClick={() => void stop()} className="rounded-full border border-line px-5 py-2">{t.stop}</button>
        </div>
      ) : phase === 'processing' ? (
        <p className="text-muted">{t.processing}</p>
      ) : (
        <div className="grid gap-4">
          <p className="font-mono text-xs text-muted">{t.latency(latencyMs)}</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={listen} className="rounded-full border border-line px-5 py-2.5">{playing ? `■ ${t.stopListen}` : `▶ ${t.listen}`}</button>
            <button onClick={retry} disabled={busy} className="rounded-full border border-line px-5 py-2.5">{t.retry}</button>
          </div>
          <label className="grid gap-1 text-sm">
            <span className="font-semibold">{t.nudge}: <span className="num">{nudgeMs > 0 ? '+' : ''}{nudgeMs} ms</span></span>
            <span className="text-muted">{t.nudgeHint}</span>
            <span className="flex items-center gap-3">
              <span className="text-xs text-muted">{t.earlier}</span>
              <input type="range" min={-250} max={250} step={5} value={nudgeMs}
                onChange={(e) => { setNudgeMs(Number(e.target.value)); if (playing) { try { previewRef.current?.stop(); } catch { /* ended */ } setPlaying(false); } }}
                className="flex-1 accent-[var(--gold)]" />
              <span className="text-xs text-muted">{t.later}</span>
            </span>
          </label>
          <button onClick={submit} disabled={busy} className="justify-self-start rounded-full bg-ink px-6 py-3 text-paper disabled:opacity-60">{busy ? t.processing : t.submit}</button>
        </div>
      )}
      {error && <p role="alert" className="text-loss">{error}</p>}
    </div>
  );
}
