import type { WaveformData } from '@/lib/types';

function resample(src: number[], n: number): Float32Array {
  const out = new Float32Array(n);
  if (!src.length) return out;
  const r = src.length / n;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * r);
    const b = Math.max(a + 1, Math.floor((i + 1) * r));
    let m = 0;
    for (let j = a; j < b && j < src.length; j++) if (src[j] > m) m = src[j];
    out[i] = m;
  }
  return out;
}

/** Draws full-band bars with the sub-bass layer inside them; `progress` 0..1 colours the played part. */
export function drawWaveform(canvas: HTMLCanvasElement, waveform: WaveformData, progress: number) {
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
  const cs = getComputedStyle(canvas);
  const color = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  const signal = color('--wave-signal', '#2944f0');
  const sub = color('--wave-sub', '#c8176b');
  const rest = color('--wave-rest', '#9ea3c0');
  const n = Math.max(1, Math.floor(w / 3));
  const full = resample(waveform.full, n);
  const low = resample(waveform.low, n);
  const played = progress * n;
  const mid = h / 2;
  for (let i = 0; i < n; i++) {
    const x = i * 3;
    const p = i < played;
    const fh = Math.max(1, full[i] * (h - 2));
    g.globalAlpha = p ? 1 : 0.6;
    g.fillStyle = p ? signal : rest;
    g.fillRect(x, mid - fh / 2, 2, fh);
    const lh = low[i] * (h - 2);
    if (lh > 0.75) {
      g.globalAlpha = p ? 1 : 0.55;
      g.fillStyle = sub;
      g.fillRect(x, mid - lh / 2, 2, lh);
    }
  }
  g.globalAlpha = 1;
}
