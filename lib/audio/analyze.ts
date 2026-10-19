import type { AudioAnalysis, WaveformData } from '@/lib/types';

const DECODE_RATE = 48000;
const SUB_CUTOFF_HZ = 100;

/** Decode any browser-supported file into an AudioBuffer for analysis. */
export async function decodeToBuffer(blob: Blob): Promise<AudioBuffer> {
  const data = await blob.arrayBuffer();
  const ctx = new OfflineAudioContext(1, 1, DECODE_RATE);
  return ctx.decodeAudioData(data);
}

/** Render a buffer through a chain of filters offline (faster than real time). */
async function renderThrough(
  buffer: AudioBuffer,
  build: (ctx: OfflineAudioContext) => AudioNode[],
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const src = new AudioBufferSourceNode(ctx, { buffer });
  let node: AudioNode = src;
  for (const next of build(ctx)) {
    node.connect(next);
    node = next;
  }
  node.connect(ctx.destination);
  src.start();
  return ctx.startRendering();
}

const channelsOf = (b: AudioBuffer) =>
  Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i));

/** Max |sample| across channels for each of `bins` slices. */
function binPeaks(buffer: AudioBuffer, bins: number): Float32Array {
  const chans = channelsOf(buffer);
  const n = buffer.length;
  const out = new Float32Array(bins);
  const step = n / bins;
  for (let b = 0; b < bins; b++) {
    const start = Math.floor(b * step);
    const end = Math.min(n, Math.floor((b + 1) * step));
    let m = 0;
    for (let i = start; i < end; i++) {
      for (const c of chans) {
        const v = c[i] < 0 ? -c[i] : c[i];
        if (v > m) m = v;
      }
    }
    out[b] = m;
  }
  return out;
}

/** Mean square per channel, averaged across channels. */
function meanSquare(buffer: AudioBuffer): number {
  let total = 0;
  for (const c of channelsOf(buffer)) {
    let s = 0;
    for (let i = 0; i < c.length; i++) s += c[i] * c[i];
    total += s / Math.max(1, c.length);
  }
  return total / Math.max(1, buffer.numberOfChannels);
}

/**
 * Gated integrated loudness in the style of ITU-R BS.1770: K-weighting
 * (approximated with Web Audio biquads), 400 ms blocks at 75% overlap,
 * -70 LUFS absolute gate, -10 LU relative gate. Close enough to drive an
 * attenuate-only level match; not a certified meter.
 */
async function integratedLoudness(buffer: AudioBuffer): Promise<number | null> {
  const k = await renderThrough(buffer, (ctx) => [
    new BiquadFilterNode(ctx, { type: 'highshelf', frequency: 1500, gain: 4 }),
    new BiquadFilterNode(ctx, { type: 'highpass', frequency: 38, Q: 0.5 }),
  ]);
  const sr = k.sampleRate;
  const block = Math.round(0.4 * sr);
  const hop = Math.round(0.1 * sr);
  if (k.length < block) return null;

  // prefix sums of squares, summed over channels (channel weights are 1.0 for L/R/mono)
  const prefix = new Float64Array(k.length + 1);
  const chans = channelsOf(k);
  for (let i = 0; i < k.length; i++) {
    let s = 0;
    for (const c of chans) s += c[i] * c[i];
    prefix[i + 1] = prefix[i] + s;
  }

  const blocks: number[] = [];
  for (let start = 0; start + block <= k.length; start += hop) {
    blocks.push((prefix[start + block] - prefix[start]) / block);
  }
  const lufs = (ms: number) => -0.691 + 10 * Math.log10(ms);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  const absGated = blocks.filter((ms) => ms > 0 && lufs(ms) > -70);
  if (absGated.length === 0) return null;
  const relThreshold = lufs(mean(absGated)) - 10;
  const relGated = absGated.filter((ms) => lufs(ms) > relThreshold);
  return relGated.length ? lufs(mean(relGated)) : null;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

export async function analyzeAudio(input: Blob | AudioBuffer, bins = 800): Promise<AudioAnalysis> {
  const buffer = input instanceof AudioBuffer ? input : await decodeToBuffer(input);
  const binCount = Math.max(1, Math.min(bins, buffer.length));

  // Two cascaded 2nd-order low-passes: a steep split so the "sub" layer
  // shows lip bass and kicks, not the body of snares.
  const low = await renderThrough(buffer, (ctx) => [
    new BiquadFilterNode(ctx, { type: 'lowpass', frequency: SUB_CUTOFF_HZ, Q: Math.SQRT1_2 }),
    new BiquadFilterNode(ctx, { type: 'lowpass', frequency: SUB_CUTOFF_HZ, Q: Math.SQRT1_2 }),
  ]);

  const fullPeaks = binPeaks(buffer, binCount);
  const lowPeaks = binPeaks(low, binCount);
  const peak = fullPeaks.reduce((m, v) => (v > m ? v : m), 0);
  const norm = peak || 1;

  const waveform: WaveformData = {
    v: 1,
    bins: binCount,
    full: Array.from(fullPeaks, (v) => round3(v / norm)),
    low: Array.from(lowPeaks, (v) => round3(Math.min(1, v / norm))),
  };

  const msFull = meanSquare(buffer);
  const msLow = meanSquare(low);

  return {
    durationMs: Math.round(buffer.duration * 1000),
    waveform,
    integratedLufs: await integratedLoudness(buffer),
    peakDbfs: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
    subRatio: msFull > 0 ? Math.min(1, msLow / msFull) : 0,
  };
}
