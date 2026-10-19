/** Concatenate worklet chunks into one Float32Array per channel, capped at maxFrames. */
export function mergeChunks(chunks: Float32Array[][], maxFrames = Infinity): Float32Array[] {
  if (chunks.length === 0) return [];
  const channelCount = chunks[0].length;
  const total = Math.min(
    chunks.reduce((n, c) => n + c[0].length, 0),
    maxFrames,
  );
  const out = Array.from({ length: channelCount }, () => new Float32Array(total));
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk[0].length, total - offset);
    if (take <= 0) break;
    for (let c = 0; c < channelCount; c++) out[c].set(chunk[c].subarray(0, take), offset);
    offset += take;
  }
  return out;
}

/**
 * Encode PCM as a RIFF/WAVE file. 24-bit by default: bit depth doesn't change
 * bass response, but it leaves headroom for beatboxers who track quietly to
 * avoid clipping on plosives. 16-bit output gets TPDF dither.
 */
export function encodeWav(channels: Float32Array[], sampleRate: number, bitDepth: 16 | 24 = 24): Blob {
  const numCh = channels.length;
  const frames = channels[0]?.length ?? 0;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = frames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let o = 0;

  const writeString = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o++, s.charCodeAt(i));
  };
  const u32 = (v: number) => { view.setUint32(o, v, true); o += 4; };
  const u16 = (v: number) => { view.setUint16(o, v, true); o += 2; };

  writeString('RIFF'); u32(36 + dataSize); writeString('WAVE');
  writeString('fmt '); u32(16); u16(1); u16(numCh); u32(sampleRate);
  u32(sampleRate * blockAlign); u16(blockAlign); u16(bitDepth);
  writeString('data'); u32(dataSize);

  const max = bitDepth === 24 ? 0x7fffff : 0x7fff;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = channels[c][i];
      if (bitDepth === 16) s += (Math.random() - Math.random()) / max; // TPDF dither, ±1 LSB
      s = s > 1 ? 1 : s < -1 ? -1 : s;
      const q = Math.round(s * max);
      if (bitDepth === 24) {
        view.setUint8(o, q & 0xff);
        view.setUint8(o + 1, (q >> 8) & 0xff);
        view.setUint8(o + 2, (q >> 16) & 0xff);
        o += 3;
      } else {
        view.setInt16(o, q, true);
        o += 2;
      }
    }
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/** Read sample rate / bit depth / channels from an uploaded WAV's fmt chunk. */
export async function readWavFormat(
  blob: Blob,
): Promise<{ sampleRate: number; bitDepth: number; channels: number } | null> {
  const view = new DataView(await blob.slice(0, 4096).arrayBuffer());
  const str = (at: number) =>
    String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));
  if (view.byteLength < 12 || str(0) !== 'RIFF' || str(8) !== 'WAVE') return null;
  let o = 12;
  while (o + 8 <= view.byteLength) {
    const id = str(o);
    const size = view.getUint32(o + 4, true);
    if (id === 'fmt ' && o + 24 <= view.byteLength) {
      return {
        channels: view.getUint16(o + 10, true),
        sampleRate: view.getUint32(o + 12, true),
        bitDepth: view.getUint16(o + 22, true),
      };
    }
    o += 8 + size + (size % 2);
  }
  return null;
}

const UPLOAD_TYPES: Record<string, { codec: string; contentType: string; lossless: boolean }> = {
  wav: { codec: 'pcm', contentType: 'audio/wav', lossless: true },
  flac: { codec: 'flac', contentType: 'audio/flac', lossless: true },
  mp3: { codec: 'mp3', contentType: 'audio/mpeg', lossless: false },
  m4a: { codec: 'aac', contentType: 'audio/mp4', lossless: false }, // assumes AAC; ALAC m4a is rare
  aac: { codec: 'aac', contentType: 'audio/aac', lossless: false },
};

export const ACCEPTED_UPLOADS = '.wav,.flac,.mp3,.m4a,.aac';

export function describeUpload(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const type = UPLOAD_TYPES[ext];
  return type ? { ext, ...type } : null;
}
