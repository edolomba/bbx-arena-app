'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RECORDER_WORKLET_SOURCE } from '@/lib/audio/recorder-worklet';
import { encodeWav, mergeChunks } from '@/lib/audio/wav';
import { analyzeAudio } from '@/lib/audio/analyze';
import type { PreparedTake } from '@/lib/types';

export type RecorderStatus = 'idle' | 'requesting' | 'ready' | 'recording' | 'processing' | 'done' | 'error';

export interface Levels {
  rmsDb: number;
  peakDb: number;
  subRmsDb: number;
}

interface Options {
  maxSeconds: number;
  bitDepth?: 16 | 24;
}

const toDb = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

function describeMicError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
      return 'Microphone access is blocked. Click the icon left of the web address, set Microphone to Allow, then reload the page. On Windows, also check Settings > Privacy > Microphone.';
    case 'NotFoundError':
      return 'No microphone was found on this device. Plug in a mic or a headset with a mic, then try again.';
    case 'NotReadableError':
      return 'Another app is using the microphone. Close it and try again.';
    case 'OverconstrainedError':
      return 'That input isn’t available anymore. Pick another microphone.';
    default:
      return err instanceof Error ? err.message : 'The microphone couldn’t start.';
  }
}

/**
 * Records uncompressed PCM straight from the mic.
 *
 * Where low end usually dies in browser recording, and what this does about it:
 *  1. Voice processing (echo cancellation, noise suppression, auto gain) runs
 *     by default on getUserMedia. Noise suppression treats sustained sub-bass
 *     as noise; AGC pumps on every bass hit. All three are turned off, and the
 *     track settings are read back so the UI can warn if the browser ignored us.
 *  2. MediaRecorder encodes with a browser-chosen codec/bitrate. We skip it and
 *     pull Float32 PCM through an AudioWorklet, then write a WAV ourselves.
 *  3. Sample-rate conversion: the AudioContext is created at the track's own
 *     rate, so samples are never resampled between mic and file.
 */
export function useHiFiRecorder({ maxSeconds, bitDepth = 24 }: Options) {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [take, setTake] = useState<PreparedTake | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const analyserFullRef = useRef<AnalyserNode | null>(null);
  const analyserSubRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Float32Array[][]>([]);
  const framesRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const stopResolveRef = useRef<(() => void) | null>(null);
  const meterBufRef = useRef<Float32Array | null>(null);
  const statusRef = useRef<RecorderStatus>('idle');
  const maxSecondsRef = useRef(maxSeconds);
  const stopRef = useRef<() => Promise<void>>(async () => {});

  statusRef.current = status;
  maxSecondsRef.current = maxSeconds;

  const teardown = useCallback(() => {
    window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    nodeRef.current?.port.close();
    nodeRef.current?.disconnect();
    nodeRef.current = null;
    analyserFullRef.current = null;
    analyserSubRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  const prepare = useCallback(
    async (requestedDeviceId?: string): Promise<string | null> => {
      teardown();
      setError(null);
      setWarnings([]);
      setStatus('requesting');
      try {
        const constraints: MediaTrackConstraints & Record<string, unknown> = {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          voiceIsolation: false, // newer Chromium; ignored where unsupported
          channelCount: { ideal: 1 }, // beatbox mics are mono; stereo interfaces still work
          sampleRate: { ideal: 48000 },
          sampleSize: { ideal: 24 },
        };
        const id = requestedDeviceId ?? deviceId;
        if (id) constraints.deviceId = { exact: id };

        const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints, video: false });
        streamRef.current = stream;
        const track = stream.getAudioTracks()[0];
        const s = track.getSettings();

        const w: string[] = [];
        if (s.noiseSuppression)
          w.push('Your browser kept noise suppression on. It strips sustained bass, so use Chrome or Firefox on desktop if your low end sounds thin.');
        if (s.autoGainControl)
          w.push('Your browser kept automatic gain on. Expect the volume to duck after heavy bass hits.');
        if (s.echoCancellation)
          w.push('Echo cancellation is still on. Use headphones and it will interfere less.');
        if (/hands-?free|headset|airpods|bluetooth|bt /i.test(track.label))
          w.push('This looks like a Bluetooth headset mic. Bluetooth call audio drops almost all low end; use a wired or USB mic.');
        setWarnings(w);

        const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
        setDevices(inputs);
        if (s.deviceId) setDeviceId(s.deviceId);

        const ctx = new AudioContext(
          s.sampleRate ? { sampleRate: s.sampleRate, latencyHint: 'interactive' } : { latencyHint: 'interactive' },
        );
        ctxRef.current = ctx;

        const url = URL.createObjectURL(new Blob([RECORDER_WORKLET_SOURCE], { type: 'application/javascript' }));
        try {
          await ctx.audioWorklet.addModule(url);
        } finally {
          URL.revokeObjectURL(url);
        }

        const source = ctx.createMediaStreamSource(stream);
        const channels = Math.min(2, Math.max(1, s.channelCount ?? 1));
        const node = new AudioWorkletNode(ctx, 'bbx-recorder', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          channelCount: channels,
          channelCountMode: 'explicit',
          channelInterpretation: 'discrete', // no up/down-mixing
          processorOptions: { batchFrames: 4096 },
        });
        node.port.onmessage = (e: MessageEvent) => {
          const msg = e.data as { type: 'chunk'; chans: Float32Array[] } | { type: 'stopped' };
          if (msg.type === 'chunk') {
            chunksRef.current.push(msg.chans);
            framesRef.current += msg.chans[0].length;
            if (framesRef.current >= maxSecondsRef.current * ctx.sampleRate && statusRef.current === 'recording') {
              void stopRef.current();
            }
          } else if (msg.type === 'stopped') {
            stopResolveRef.current?.();
            stopResolveRef.current = null;
          }
        };

        // The worklet must be pulled by the graph to run; route it to a muted gain.
        const sink = new GainNode(ctx, { gain: 0 });
        source.connect(node);
        node.connect(sink).connect(ctx.destination);

        // Metering taps (read-only; they never touch the recorded signal).
        const analyserFull = new AnalyserNode(ctx, { fftSize: 2048 });
        const analyserSub = new AnalyserNode(ctx, { fftSize: 4096 });
        source.connect(analyserFull);
        source
          .connect(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 100, Q: Math.SQRT1_2 }))
          .connect(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 100, Q: Math.SQRT1_2 }))
          .connect(analyserSub);

        nodeRef.current = node;
        analyserFullRef.current = analyserFull;
        analyserSubRef.current = analyserSub;
        setStatus('ready');
        return null;
      } catch (err) {
        teardown();
        const message = describeMicError(err);
        setError(message);
        setStatus('error');
        return message;
      }
    },
    [deviceId, teardown],
  );

  const start = useCallback(async () => {
    const ctx = ctxRef.current;
    const node = nodeRef.current;
    if (!ctx || !node) return;
    await ctx.resume();
    chunksRef.current = [];
    framesRef.current = 0;
    setElapsedMs(0);
    setTake(null);
    setError(null);
    node.port.postMessage({ type: 'start' });
    statusRef.current = 'recording';
    setStatus('recording');
    timerRef.current = window.setInterval(() => {
      setElapsedMs((framesRef.current / ctx.sampleRate) * 1000);
    }, 100);
  }, []);

  const stop = useCallback(async (): Promise<PreparedTake | null> => {
    const ctx = ctxRef.current;
    const node = nodeRef.current;
    if (!ctx || !node || statusRef.current !== 'recording') return null;
    statusRef.current = 'processing';
    setStatus('processing');
    window.clearInterval(timerRef.current);

    await new Promise<void>((resolve) => {
      stopResolveRef.current = resolve;
      node.port.postMessage({ type: 'stop' });
    });

    try {
      const sr = ctx.sampleRate;
      const channels = mergeChunks(chunksRef.current, Math.floor(maxSecondsRef.current * sr));
      chunksRef.current = [];
      if (!channels.length || channels[0].length < sr) {
        throw new Error('That take is under a second long. Record again.');
      }
      const buffer = new AudioBuffer({ length: channels[0].length, numberOfChannels: channels.length, sampleRate: sr });
      channels.forEach((c, i) => buffer.copyToChannel(c, i));

      const blob = encodeWav(channels, sr, bitDepth);
      const analysis = await analyzeAudio(buffer);

      const result: PreparedTake = {
        blob,
        fileExt: 'wav',
        contentType: 'audio/wav',
        analysis,
        sourceCodec: bitDepth === 24 ? 'pcm_s24le' : 'pcm_s16le',
        isLossless: true,
        sampleRate: sr,
        bitDepth,
        channels: channels.length,
      };
      setTake(result);
      setElapsedMs(analysis.durationMs);
      setStatus('done');
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The take couldn’t be processed.');
      setStatus('ready');
      return null;
    }
  }, [bitDepth]);

  stopRef.current = async () => { await stop(); };

  /** Discard the current take and go back to a live mic. */
  const reset = useCallback(() => {
    setTake(null);
    setElapsedMs(0);
    setStatus(ctxRef.current ? 'ready' : 'idle');
  }, []);

  const selectDevice = useCallback((id: string) => {
    setDeviceId(id);
    void prepare(id);
  }, [prepare]);

  /** Poll from requestAnimationFrame; reading levels never triggers a re-render. */
  const getLevels = useCallback((): Levels | null => {
    const full = analyserFullRef.current;
    const sub = analyserSubRef.current;
    if (!full || !sub) return null;
    if (!meterBufRef.current || meterBufRef.current.length < sub.fftSize) {
      meterBufRef.current = new Float32Array(Math.max(full.fftSize, sub.fftSize));
    }
    const buf = meterBufRef.current;

    const a = buf.subarray(0, full.fftSize);
    full.getFloatTimeDomainData(a);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < a.length; i++) {
      const v = Math.abs(a[i]);
      sum += a[i] * a[i];
      if (v > peak) peak = v;
    }
    const rms = Math.sqrt(sum / a.length);

    const b = buf.subarray(0, sub.fftSize);
    sub.getFloatTimeDomainData(b);
    let subSum = 0;
    for (let i = 0; i < b.length; i++) subSum += b[i] * b[i];

    return { rmsDb: toDb(rms), peakDb: toDb(peak), subRmsDb: toDb(Math.sqrt(subSum / b.length)) };
  }, []);

  /** The raw mic stream, so a live stage can send the same microphone it records. */
  const getStream = useCallback(() => streamRef.current, []);

  return {
    getStream,
    status,
    error,
    warnings,
    devices,
    deviceId,
    elapsedMs,
    take,
    prepare,
    start,
    stop,
    reset,
    selectDevice,
    getLevels,
  };
}
