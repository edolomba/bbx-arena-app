import { analyzeAudio } from './analyze';
import { encodeTakeFlac } from './encode';
import type { PreparedTake } from '@/lib/types';

/**
 * Mixes takes that start at the same moment (two Tag Team members recording the
 * same stage round from its scheduled start) into one stereo lossless take.
 * The sum is only scaled down if it would clip.
 */
export async function mixTakes(blobs: Blob[], sampleRate = 48000): Promise<PreparedTake> {
  const ctx = new OfflineAudioContext(2, 1, sampleRate);
  const buffers = await Promise.all(blobs.map(async (b) => ctx.decodeAudioData(await b.arrayBuffer())));
  const n = Math.max(...buffers.map((b) => b.length));
  const L = new Float32Array(n), R = new Float32Array(n);
  for (const b of buffers) {
    const l = b.getChannelData(0), r = b.numberOfChannels > 1 ? b.getChannelData(1) : l;
    for (let i = 0; i < b.length; i++) { L[i] += l[i]; R[i] += r[i]; }
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  if (peak > 0.999) { const g = 0.999 / peak; for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; } }
  const out = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate });
  out.copyToChannel(L as Float32Array<ArrayBuffer>, 0);
  out.copyToChannel(R as Float32Array<ArrayBuffer>, 1);
  const [blob, analysis] = await Promise.all([encodeTakeFlac([L, R], sampleRate, 24), analyzeAudio(out)]);
  return { blob, fileExt: 'flac', contentType: 'audio/flac', analysis, sourceCodec: 'flac', isLossless: true, sampleRate, bitDepth: 24, channels: 2 };
}
