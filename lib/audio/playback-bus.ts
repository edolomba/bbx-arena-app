/**
 * Shared playback plumbing for every WaveformPlayer on the page:
 *  - one AudioContext (browsers cap how many you can open)
 *  - exclusive playback: starting one player pauses the others, which is
 *    what you want when A/B-ing two battlers.
 */
let ctx: AudioContext | null = null;

export function getPlaybackContext(): AudioContext {
  if (!ctx || ctx.state === 'closed') ctx = new AudioContext({ latencyHint: 'playback' });
  return ctx;
}

type Listener = (playingId: string) => void;
const listeners = new Set<Listener>();

export function announcePlay(id: string) {
  listeners.forEach((l) => l(id));
}

export function onOtherPlay(id: string, pause: () => void): () => void {
  const l: Listener = (playingId) => {
    if (playingId !== id) pause();
  };
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const dbToGain = (db: number) => Math.pow(10, db / 20);
