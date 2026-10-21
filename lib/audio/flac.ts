/**
 * Lossless FLAC encoder, written for BBX Arena (no dependencies).
 *
 * The samples are quantised exactly like the WAV encoder, then stored with
 * FLAC's fixed polynomial predictors (orders 0–4), Rice-coded residuals with
 * per-partition parameters, constant subframes for digital silence, and the
 * best of left/right, left/side, right/side or mid/side per frame. Decoding
 * gives back every sample bit for bit; files are typically 40–60 % of the WAV.
 */

const BLOCK = 4096;
const MAX_PARTITION_ORDER = 8;

// ---------------------------------------------------------------------------
// Bit writer
// ---------------------------------------------------------------------------
class BitWriter {
  buf: Uint8Array;
  pos = 0; // bytes written
  private acc = 0; // pending bits (up to 31)
  private n = 0; // number of pending bits

  constructor(size: number) {
    this.buf = new Uint8Array(size);
  }

  private ensure(extra: number) {
    if (this.pos + extra <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.pos + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.pos));
    this.buf = next;
  }

  /** Write the low `bits` bits of value (bits ≤ 24 per call; larger values are split). */
  write(value: number, bits: number) {
    if (bits === 0) return;
    if (bits > 24) {
      const hi = bits - 24;
      this.write(Math.floor(value / 0x1000000) & ((1 << hi) - 1), hi);
      this.write(value & 0xffffff, 24);
      return;
    }
    this.ensure(8);
    this.acc = (this.acc << bits) | (value & ((1 << bits) - 1));
    this.n += bits;
    while (this.n >= 8) {
      this.n -= 8;
      this.buf[this.pos++] = (this.acc >>> this.n) & 0xff;
    }
    this.acc &= (1 << this.n) - 1;
  }

  /** `count` zero bits followed by a one (unary). */
  unary(count: number) {
    while (count >= 24) {
      this.write(0, 24);
      count -= 24;
    }
    this.write(1, count + 1);
  }

  /** Pad with zero bits to the next byte boundary. */
  align() {
    if (this.n > 0) this.write(0, 8 - this.n);
  }

  bytes() {
    return this.buf.subarray(0, this.pos);
  }
}

// ---------------------------------------------------------------------------
// CRCs used by FLAC frames
// ---------------------------------------------------------------------------
const CRC8 = new Uint8Array(256);
const CRC16 = new Uint16Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
  CRC8[i] = c;
  let d = i << 8;
  for (let j = 0; j < 8; j++) d = d & 0x8000 ? ((d << 1) ^ 0x8005) & 0xffff : (d << 1) & 0xffff;
  CRC16[i] = d;
}
const crc8 = (b: Uint8Array, from: number, to: number) => {
  let c = 0;
  for (let i = from; i < to; i++) c = CRC8[c ^ b[i]];
  return c;
};
const crc16 = (b: Uint8Array, from: number, to: number) => {
  let c = 0;
  for (let i = from; i < to; i++) c = ((c << 8) & 0xffff) ^ CRC16[(c >> 8) ^ b[i]];
  return c;
};

// ---------------------------------------------------------------------------
// Subframe planning
// ---------------------------------------------------------------------------
type Plan =
  | { kind: 'constant'; bits: number; value: number }
  | { kind: 'verbatim'; bits: number }
  | { kind: 'fixed'; bits: number; order: number; residual: Int32Array; partOrder: number; params: number[] };

/** Residual of the fixed predictor of the given order (first `order` entries unused). */
function fixedResidual(x: Int32Array, order: number): Int32Array {
  const n = x.length;
  const r = new Int32Array(n);
  for (let i = order; i < n; i++) {
    switch (order) {
      case 0: r[i] = x[i]; break;
      case 1: r[i] = x[i] - x[i - 1]; break;
      case 2: r[i] = x[i] - 2 * x[i - 1] + x[i - 2]; break;
      case 3: r[i] = x[i] - 3 * x[i - 1] + 3 * x[i - 2] - x[i - 3]; break;
      default: r[i] = x[i] - 4 * x[i - 1] + 6 * x[i - 2] - 4 * x[i - 3] + x[i - 4];
    }
  }
  return r;
}

const zigzag = (v: number) => (v >= 0 ? v * 2 : -v * 2 - 1);

/** Estimated Rice cost of `count` values summing to `sum` with parameter k. */
const riceCost = (count: number, sum: number, k: number) => count * (k + 1) + Math.floor(sum / 2 ** k);

function bestK(count: number, sum: number): [number, number] {
  if (count === 0) return [0, 0];
  const mean = sum / count;
  const guess = mean > 1 ? Math.floor(Math.log2(mean)) : 0;
  let k = guess, bits = Infinity;
  for (let c = Math.max(0, guess - 1); c <= Math.min(30, guess + 1); c++) {
    const b = riceCost(count, sum, c);
    if (b < bits) { bits = b; k = c; }
  }
  return [k, bits];
}

/**
 * Best partition order and Rice parameters (RICE2, 5-bit parameters).
 * Sums are taken once at the finest partition level and merged upwards,
 * so planning costs one pass over the residual.
 */
function planRice(res: Int32Array, order: number) {
  const n = res.length;
  let maxP = 0;
  while (maxP < MAX_PARTITION_ORDER && n % (1 << (maxP + 1)) === 0 && n >> (maxP + 1) > order) maxP++;

  let parts = 1 << maxP;
  const size = n / parts;
  let sums = new Float64Array(parts);
  let counts = new Float64Array(parts);
  for (let j = 0; j < parts; j++) {
    const from = j === 0 ? order : j * size;
    let s = 0;
    for (let i = from; i < (j + 1) * size; i++) s += zigzag(res[i]);
    sums[j] = s;
    counts[j] = (j + 1) * size - from;
  }

  let best = { bits: Infinity, partOrder: 0, params: [0] };
  for (let p = maxP; p >= 0; p--) {
    let total = 6; // coding method + partition order
    const params: number[] = [];
    for (let j = 0; j < parts; j++) {
      const [k, bits] = bestK(counts[j], sums[j]);
      params.push(k);
      total += 5 + bits;
    }
    if (total < best.bits) best = { bits: total, partOrder: p, params };
    if (p > 0) {
      const half = parts / 2;
      const ns = new Float64Array(half), nc = new Float64Array(half);
      for (let j = 0; j < half; j++) {
        ns[j] = sums[2 * j] + sums[2 * j + 1];
        nc[j] = counts[2 * j] + counts[2 * j + 1];
      }
      sums = ns; counts = nc; parts = half;
    }
  }
  return best;
}

function planSubframe(x: Int32Array, bps: number): Plan {
  const n = x.length;
  let constant = true;
  for (let i = 1; i < n && constant; i++) if (x[i] !== x[0]) constant = false;
  if (constant) return { kind: 'constant', bits: 8 + bps, value: x[0] };

  let best: Plan = { kind: 'verbatim', bits: 8 + n * bps };
  for (let order = 0; order <= 4 && order < n; order++) {
    const residual = fixedResidual(x, order);
    const rice = planRice(residual, order);
    const bits = 8 + order * bps + rice.bits;
    if (bits < best.bits) best = { kind: 'fixed', bits, order, residual, partOrder: rice.partOrder, params: rice.params };
  }
  return best;
}

function writeSubframe(w: BitWriter, x: Int32Array, bps: number, plan: Plan) {
  w.write(0, 1); // zero padding bit
  if (plan.kind === 'constant') {
    w.write(0b000000, 6); w.write(0, 1);
    w.write(plan.value, bps);
    return;
  }
  if (plan.kind === 'verbatim') {
    w.write(0b000001, 6); w.write(0, 1);
    for (let i = 0; i < x.length; i++) w.write(x[i], bps);
    return;
  }
  w.write(0b001000 | plan.order, 6); w.write(0, 1);
  for (let i = 0; i < plan.order; i++) w.write(x[i], bps); // warm-up samples
  w.write(0b01, 2); // RICE2
  w.write(plan.partOrder, 4);
  const parts = 1 << plan.partOrder;
  const size = x.length / parts;
  for (let j = 0; j < parts; j++) {
    const k = plan.params[j];
    w.write(k, 5);
    const from = j === 0 ? plan.order : j * size;
    const to = (j + 1) * size;
    const div = 2 ** k;
    for (let i = from; i < to; i++) {
      const u = zigzag(plan.residual[i]);
      w.unary(Math.floor(u / div));
      if (k > 0) w.write(u % div, k);
    }
  }
}

// ---------------------------------------------------------------------------
// Frames and stream
// ---------------------------------------------------------------------------
function utf8Number(w: BitWriter, n: number) {
  if (n < 0x80) { w.write(n, 8); return; }
  const bytes: number[] = [];
  let lead = 0xc0, max = 0x1f;
  let v = n;
  while (v > max) {
    bytes.unshift(0x80 | (v & 0x3f));
    v = Math.floor(v / 64);
    lead = 0x80 | (lead >> 1);
    max >>= 1;
  }
  bytes.unshift(lead | v);
  for (const b of bytes) w.write(b, 8);
}

/** Quantise float samples to signed integers exactly like encodeWav (with the same 16-bit dither). */
export function quantize(channels: Float32Array[], bitDepth: 16 | 24): Int32Array[] {
  const max = bitDepth === 24 ? 0x7fffff : 0x7fff;
  return channels.map((c) => {
    const out = new Int32Array(c.length);
    for (let i = 0; i < c.length; i++) {
      let s = c[i];
      if (bitDepth === 16) s += (Math.random() - Math.random()) / max;
      s = s > 1 ? 1 : s < -1 ? -1 : s;
      out[i] = Math.round(s * max);
    }
    return out;
  });
}

/** Encode already-quantised integer samples (1 or 2 channels). */
export function encodeFlacInts(ints: Int32Array[], sampleRate: number, bitDepth: 16 | 24): Uint8Array {
  const channels = ints.length;
  if (channels < 1 || channels > 2) throw new Error('FLAC encoder supports mono or stereo');
  const total = ints[0].length;
  const w = new BitWriter(Math.max(1024, Math.ceil(total * channels * (bitDepth / 8) * 0.75)));

  // "fLaC" + STREAMINFO (last metadata block)
  w.write(0x664c6143, 32);
  w.write(1, 1); w.write(0, 7); w.write(34, 24);
  w.write(BLOCK, 16); w.write(BLOCK, 16);
  w.write(0, 24); w.write(0, 24); // min/max frame size unknown
  w.write(sampleRate, 20);
  w.write(channels - 1, 3);
  w.write(bitDepth - 1, 5);
  w.write(total, 36);
  for (let i = 0; i < 16; i++) w.write(0, 8); // MD5 not computed (allowed)

  const sizeCode = bitDepth === 24 ? 0b110 : 0b100;
  for (let start = 0, frame = 0; start < total; start += BLOCK, frame++) {
    const len = Math.min(BLOCK, total - start);
    const blocks = ints.map((c) => c.subarray(start, start + len));

    // Channel decorrelation: pick the cheapest of independent, L/S, R/S, M/S.
    let assignment = channels - 1; // independent
    let data: Int32Array[] = blocks;
    let depths: number[] = blocks.map(() => bitDepth);
    let plans = blocks.map((b) => planSubframe(b, bitDepth));
    if (channels === 2) {
      const [l, r] = blocks;
      const side = new Int32Array(len), mid = new Int32Array(len);
      for (let i = 0; i < len; i++) {
        side[i] = l[i] - r[i];
        mid[i] = (l[i] + r[i]) >> 1;
      }
      const ps = planSubframe(side, bitDepth + 1);
      const pm = planSubframe(mid, bitDepth);
      const [pl, pr] = plans;
      const options = [
        { a: 1, bits: pl.bits + pr.bits, d: [l, r], dep: [bitDepth, bitDepth], p: [pl, pr] },
        { a: 8, bits: pl.bits + ps.bits, d: [l, side], dep: [bitDepth, bitDepth + 1], p: [pl, ps] },
        { a: 9, bits: ps.bits + pr.bits, d: [side, r], dep: [bitDepth + 1, bitDepth], p: [ps, pr] },
        { a: 10, bits: pm.bits + ps.bits, d: [mid, side], dep: [bitDepth, bitDepth + 1], p: [pm, ps] },
      ];
      const pick = options.reduce((a, b) => (b.bits < a.bits ? b : a));
      assignment = pick.a; data = pick.d; depths = pick.dep; plans = pick.p;
    }

    const frameStart = w.pos;
    w.write(0b11111111111110, 14); w.write(0, 1); w.write(0, 1); // sync, reserved, fixed blocksize
    w.write(0b0111, 4); // block size: 16-bit (n-1) at end of header
    w.write(0b0000, 4); // sample rate: from STREAMINFO
    w.write(assignment, 4);
    w.write(sizeCode, 3); w.write(0, 1);
    utf8Number(w, frame);
    w.write(len - 1, 16);
    w.write(crc8(w.buf, frameStart, w.pos), 8);

    for (let c = 0; c < channels; c++) writeSubframe(w, data[c], depths[c], plans[c]);
    w.align();
    w.write(crc16(w.buf, frameStart, w.pos), 16);
  }
  return w.bytes().slice();
}

/** Float PCM to a FLAC Blob, sample-for-sample identical to the 24-bit (or dithered 16-bit) WAV. */
export function encodeFlac(channels: Float32Array[], sampleRate: number, bitDepth: 16 | 24 = 24): Blob {
  const bytes = encodeFlacInts(quantize(channels, bitDepth), sampleRate, bitDepth);
  return new Blob([bytes], { type: 'audio/flac' });
}
