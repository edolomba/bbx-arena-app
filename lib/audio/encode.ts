import { encodeFlac } from './flac';

let worker: Worker | null = null;
let nextId = 1;

/**
 * Lossless FLAC of the take, encoded in a background worker when the browser
 * allows it (falls back to the main thread otherwise). Same samples as the WAV,
 * roughly half the size.
 */
export async function encodeTakeFlac(channels: Float32Array[], sampleRate: number, bitDepth: 16 | 24): Promise<Blob> {
  if (typeof Worker === 'undefined') return encodeFlac(channels, sampleRate, bitDepth);
  try {
    worker ??= new Worker(new URL('./flac.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return encodeFlac(channels, sampleRate, bitDepth);
  }
  const id = nextId++;
  const w = worker;
  // Copies, so the caller's buffers stay usable for analysis and preview.
  const copies = channels.map((c) => c.slice());
  return new Promise<Blob>((resolve, reject) => {
    const onMessage = (e: MessageEvent<{ id: number; bytes?: Uint8Array; error?: string }>) => {
      if (e.data.id !== id) return;
      w.removeEventListener('message', onMessage);
      if (e.data.bytes) resolve(new Blob([e.data.bytes], { type: 'audio/flac' }));
      else reject(new Error(e.data.error ?? 'encode failed'));
    };
    w.addEventListener('message', onMessage);
    w.postMessage({ id, channels: copies, sampleRate, bitDepth }, copies.map((c) => c.buffer));
  });
}
