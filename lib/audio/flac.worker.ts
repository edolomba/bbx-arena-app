/// <reference lib="webworker" />
import { encodeFlac } from './flac';

/** Encodes off the main thread so the page (and a live stage) never freezes. */
self.onmessage = async (e: MessageEvent<{ id: number; channels: Float32Array[]; sampleRate: number; bitDepth: 16 | 24 }>) => {
  const { id, channels, sampleRate, bitDepth } = e.data;
  try {
    const blob = encodeFlac(channels, sampleRate, bitDepth);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    (self as unknown as Worker).postMessage({ id, bytes }, [bytes.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : 'encode failed' });
  }
};
