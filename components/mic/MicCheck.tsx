'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { LocalAudioTrack, Room, RoomEvent, Track, type RemoteAudioTrack, type RemoteTrack } from 'livekit-client';
import { useHiFiRecorder } from '@/hooks/useHiFiRecorder';
import { decodeToBuffer } from '@/lib/audio/analyze';
import { STAGE_PUBLISH } from '@/lib/live/stage';
import WaveformPlayer from '@/components/audio/WaveformPlayer';
import { formatDb } from '@/lib/format';
import { useI18n } from '@/components/i18n/I18nProvider';

type Verdict = { ok: 'good' | 'warn' | 'bad'; title: string; detail: string };

const TEST_SECONDS = 10;
const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const bar = (d: number) => Math.max(0, Math.min(1, (d + 66) / 60));

async function renderBand(buffer: AudioBuffer, type: BiquadFilterType, frequency: number) {
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const src = new AudioBufferSourceNode(ctx, { buffer });
  src.connect(new BiquadFilterNode(ctx, { type, frequency, Q: Math.SQRT1_2 }))
     .connect(new BiquadFilterNode(ctx, { type, frequency, Q: Math.SQRT1_2 }))
     .connect(ctx.destination);
  src.start();
  return ctx.startRendering();
}
const meanSquare = (b: AudioBuffer) => {
  const c = b.getChannelData(0);
  let s = 0;
  for (let i = 0; i < c.length; i++) s += c[i] * c[i];
  return s / c.length;
};

/** Everything a beatboxer needs to know before going on stage: mic, settings, sound, and the live connection. */
export default function MicCheck({ signedIn }: { signedIn: boolean }) {
  const t = useI18n().t.mic;
  const rec = useHiFiRecorder({ maxSeconds: TEST_SECONDS });
  const [settings, setSettings] = useState<MediaTrackSettings | null>(null);
  const [verdicts, setVerdicts] = useState<Verdict[] | null>(null);
  const [testing, setTesting] = useState(false);
  const fullRef = useRef<HTMLDivElement>(null);
  const lowRef = useRef<HTMLDivElement>(null);
  const highRef = useRef<HTMLDivElement>(null);

  // ---------- live meters: full, low (<100 Hz), high (>5 kHz) ----------
  useEffect(() => {
    const stream = rec.getStream();
    if (!stream || rec.status === 'idle' || rec.status === 'error') return;
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const mk = (filter?: BiquadFilterOptions) => {
      const a = new AnalyserNode(ctx, { fftSize: 2048 });
      if (filter) src.connect(new BiquadFilterNode(ctx, filter)).connect(new BiquadFilterNode(ctx, filter)).connect(a);
      else src.connect(a);
      return a;
    };
    const full = mk(), low = mk({ type: 'lowpass', frequency: 100, Q: Math.SQRT1_2 }), high = mk({ type: 'highpass', frequency: 5000, Q: Math.SQRT1_2 });
    const buf = new Float32Array(2048);
    let raf = 0;
    const rms = (a: AnalyserNode) => { a.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); };
    const loop = () => {
      fullRef.current?.style.setProperty('transform', `scaleX(${bar(db(rms(full)) + 6)})`);
      lowRef.current?.style.setProperty('transform', `scaleX(${bar(db(rms(low)) + 6)})`);
      highRef.current?.style.setProperty('transform', `scaleX(${bar(db(rms(high)) + 18)})`);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    setSettings(stream.getAudioTracks()[0]?.getSettings() ?? null);
    return () => { cancelAnimationFrame(raf); void ctx.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.status === 'ready' || rec.status === 'recording' || rec.status === 'done', rec.deviceId]);

  // ---------- analyse the 10-second test take ----------
  useEffect(() => {
    if (!rec.take || !testing) return;
    setTesting(false);
    (async () => {
      const a = rec.take!.analysis;
      const buffer = await decodeToBuffer(rec.take!.blob);
      const c = buffer.getChannelData(0);
      let clips = 0;
      for (let i = 0; i < c.length; i++) if (Math.abs(c[i]) >= 0.999) clips++;
      // noise floor: quietest 10% of 50 ms blocks
      const block = Math.round(buffer.sampleRate * 0.05);
      const blocks: number[] = [];
      for (let s = 0; s + block <= c.length; s += block) {
        let q = 0;
        for (let i = s; i < s + block; i++) q += c[i] * c[i];
        blocks.push(db(Math.sqrt(q / block)));
      }
      blocks.sort((x, y) => x - y);
      const floor = blocks[Math.floor(blocks.length * 0.1)] ?? -120;
      const total = meanSquare(buffer) || 1e-12;
      const highShare = meanSquare(await renderBand(buffer, 'highpass', 5000)) / total;

      const v: Verdict[] = [];
      if (clips > 20 || a.peakDbfs > -0.3) v.push({ ok: 'bad', title: t.clipT, detail: t.clipD });
      else if ((a.integratedLufs ?? -70) < -36) v.push({ ok: 'warn', title: t.quietT, detail: t.quietD });
      else v.push({ ok: 'good', title: t.goodT, detail: t.goodD(formatDb(a.integratedLufs, 'LUFS'), formatDb(a.peakDbfs, 'dBFS')) });

      v.push(a.subRatio > 0.04
        ? { ok: 'good', title: t.lowOkT, detail: t.lowOkD }
        : { ok: 'warn', title: t.lowBadT, detail: t.lowBadD });
      v.push(highShare > 0.003
        ? { ok: 'good', title: t.highOkT, detail: t.highOkD }
        : { ok: 'warn', title: t.highBadT, detail: t.highBadD });
      v.push(floor < -55
        ? { ok: 'good', title: t.bgOkT, detail: Number.isFinite(floor) ? t.bgOkD(formatDb(floor, 'dB')) : t.bgSilent }
        : floor < -45
          ? { ok: 'warn', title: t.bgSomeT, detail: t.bgSomeD }
          : { ok: 'bad', title: t.bgBadT, detail: t.bgBadD });
      const processing = settings && (settings.noiseSuppression || settings.autoGainControl || settings.echoCancellation);
      v.push(processing
        ? { ok: 'bad', title: t.procBadT, detail: t.procBadD }
        : { ok: 'good', title: t.procOkT, detail: t.procOkD });
      setVerdicts(v);
    })();
  }, [rec.take, testing, settings]);

  const startTest = async () => {
    setVerdicts(null);
    setTesting(true);
    rec.reset();
    await rec.start();
  };

  const onOff = (v: boolean | undefined) => (v ? <span className="text-loss">{t.on}</span> : <span className="text-win">{t.off}</span>);
  const live = rec.status === 'ready' || rec.status === 'recording' || rec.status === 'processing' || rec.status === 'done';

  return (
    <div className="grid gap-12">
      {/* ---------- 1. microphone ---------- */}
      <section className="grid gap-5">
        <h2 className="text-2xl font-bold [font-stretch:112%]">{t.step1}</h2>
        {!live ? (
          <div className="grid justify-items-start gap-3">
            <p className="max-w-[60ch] text-muted">{t.step1Lead}</p>
            <button onClick={() => rec.prepare()} disabled={rec.status === 'requesting'} className="rounded-full bg-ink px-6 py-3 text-paper disabled:opacity-60">
              {rec.status === 'requesting' ? t.waiting : t.start}
            </button>
            {rec.error && <p role="alert" className="text-loss">{rec.error}</p>}
          </div>
        ) : (
          <>
            {rec.devices.length > 1 && (
              <label className="grid max-w-md gap-1 text-sm">
                <span className="text-muted">{t.microphone}</span>
                <select value={rec.deviceId} onChange={(e) => rec.selectDevice(e.target.value)} disabled={rec.status === 'recording'}
                  className="rounded-lg border border-line bg-surface px-3 py-2">
                  {rec.devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || t.input(i + 1)}</option>)}
                </select>
              </label>
            )}
            <div className="grid max-w-2xl gap-2">
              {[
                { ref: fullRef, label: t.overall, color: 'bg-signal' },
                { ref: lowRef, label: t.low, color: 'bg-sub' },
                { ref: highRef, label: t.high, color: 'bg-win' },
              ].map((m) => (
                <div key={m.label} className="grid grid-cols-[13rem_1fr] items-center gap-3 text-sm">
                  <span className="text-muted">{m.label}</span>
                  <div className="h-2.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                    <div ref={m.ref} className={`h-full origin-left rounded-full ${m.color}`} style={{ transform: 'scaleX(0)' }} />
                  </div>
                </div>
              ))}
              <p className="text-sm text-muted">{t.meterHint}</p>
            </div>

            {settings && (
              <dl className="grid max-w-2xl grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                <div><dt className="text-muted">{t.noise}</dt><dd>{onOff(settings.noiseSuppression)}</dd></div>
                <div><dt className="text-muted">{t.agc}</dt><dd>{onOff(settings.autoGainControl)}</dd></div>
                <div><dt className="text-muted">{t.echo}</dt><dd>{onOff(settings.echoCancellation)}</dd></div>
                <div><dt className="text-muted">{t.rate}</dt><dd className="num">{settings.sampleRate ? `${settings.sampleRate / 1000} kHz` : '—'}</dd></div>
                <div><dt className="text-muted">{t.channels}</dt><dd className="num">{settings.channelCount ?? '—'}</dd></div>
              </dl>
            )}
            {rec.warnings.length > 0 && (
              <ul className="grid max-w-2xl gap-1 rounded-lg border border-sub/40 bg-sub/5 p-3 text-sm">{rec.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            )}

            <div className="grid justify-items-start gap-3">
              <button onClick={startTest} disabled={rec.status === 'recording' || rec.status === 'processing'} className="rounded-full bg-ink px-6 py-3 text-paper disabled:opacity-60">
                {rec.status === 'recording' ? t.recording(Math.ceil(TEST_SECONDS - rec.elapsedMs / 1000)) : rec.status === 'processing' ? t.analysing : t.record(TEST_SECONDS)}
              </button>
              <p className="text-sm text-muted">{t.recordHint(TEST_SECONDS)}</p>
            </div>

            {rec.take && (
              <div className="grid max-w-3xl gap-3">
                <WaveformPlayer src={URL.createObjectURL(rec.take.blob)} waveform={rec.take.analysis.waveform} durationMs={rec.take.analysis.durationMs} label={t.yourTest} />
                <p className="text-sm text-muted">{t.listenBack}</p>
              </div>
            )}
            {verdicts && (
              <ul className="grid max-w-3xl gap-2">
                {verdicts.map((v) => (
                  <li key={v.title} className={`rounded-xl border-l-4 bg-surface p-3 ${v.ok === 'good' ? 'border-win' : v.ok === 'warn' ? 'border-sub' : 'border-loss'}`}>
                    <p className="font-semibold">{v.title}</p>
                    <p className="text-sm text-muted">{v.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {/* ---------- 2. live connection ---------- */}
      <section className="grid gap-4">
        <h2 className="text-2xl font-bold [font-stretch:112%]">{t.step2}</h2>
        <p className="max-w-[62ch] text-muted">
          {t.step2Lead}
        </p>
        {!signedIn ? (
          <p><Link href="/login?next=/mic-check" className="underline underline-offset-4">{t.logIn}</Link> {t.toTestLive}</p>
        ) : !live ? (
          <p className="text-muted">{t.startAbove}</p>
        ) : (
          <LiveTest getStream={rec.getStream} />
        )}
      </section>
    </div>
  );
}

function LiveTest({ getStream }: { getStream: () => MediaStream | null }) {
  const t = useI18n().t.mic;
  const [state, setState] = useState<'idle' | 'connecting' | 'running' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hear, setHear] = useState(false);
  const [stats, setStats] = useState<{ kbps: number; loss: number; jitter: number; rtt: number | null } | null>(null);
  const roomsRef = useRef<Room[]>([]);
  const elRef = useRef<HTMLMediaElement | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const stop = useMemo(() => () => {
    window.clearInterval(timerRef.current);
    elRef.current?.remove();
    elRef.current = null;
    roomsRef.current.forEach((r) => void r.disconnect());
    roomsRef.current = [];
  }, []);
  useEffect(() => stop, [stop]);
  useEffect(() => { if (elRef.current) elRef.current.muted = !hear; }, [hear]);

  async function run() {
    setError(null);
    setStats(null);
    setState('connecting');
    try {
      const ticket = async (role: 'send' | 'listen') => {
        const res = await fetch('/api/livekit/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ micTest: role }) });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? t.roomFailed);
        return body as { token: string; url: string };
      };
      const [s, l] = await Promise.all([ticket('send'), ticket('listen')]);
      const sender = new Room({ adaptiveStream: false, dynacast: false });
      const listener = new Room({ adaptiveStream: false, dynacast: false });
      roomsRef.current = [sender, listener];

      let remote: RemoteAudioTrack | null = null;
      listener.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio) return;
        remote = track as RemoteAudioTrack;
        const el = track.attach();
        el.muted = !hear;
        document.body.appendChild(el);
        elRef.current = el;
      });
      await listener.connect(l.url, l.token);
      await listener.startAudio();
      await sender.connect(s.url, s.token);
      const source = getStream()?.getAudioTracks()[0];
      if (!source) throw new Error(t.micNotRunning);
      const mic = new LocalAudioTrack(source.clone(), undefined, true);
      await sender.localParticipant.publishTrack(mic, { source: Track.Source.Microphone, ...STAGE_PUBLISH });
      setState('running');

      let last: { bytes: number; lost: number; recv: number; t: number } | null = null;
      let ticks = 0;
      timerRef.current = window.setInterval(async () => {
        const r = remote ? await remote.getReceiverStats() : undefined;
        const out = await mic.getSenderStats();
        if (r) {
          const now = { bytes: r.bytesReceived ?? 0, lost: r.packetsLost ?? 0, recv: r.packetsReceived ?? 0, t: r.timestamp };
          if (last && now.t > last.t) {
            const kbps = ((now.bytes - last.bytes) * 8) / (now.t - last.t);
            const lost = now.lost - last.lost;
            const got = now.recv - last.recv;
            setStats({ kbps, loss: got + lost > 0 ? (lost / (got + lost)) * 100 : 0, jitter: (r.jitter ?? 0) * 1000, rtt: out?.roundTripTime != null ? out.roundTripTime * 1000 : null });
          }
          last = now;
        }
        ticks++;
        if (ticks >= 15) { window.clearInterval(timerRef.current); setState('done'); }
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.liveFailed);
      setState('error');
      stop();
    }
  }

  const good = stats && stats.loss < 2 && stats.jitter < 30 && (stats.rtt ?? 0) < 300;
  return (
    <div className="grid max-w-3xl gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => { stop(); void run(); }} disabled={state === 'connecting' || state === 'running'} className="rounded-full bg-ink px-6 py-3 text-paper disabled:opacity-60">
          {state === 'connecting' ? t.connecting : state === 'running' ? t.testing : state === 'done' ? t.again : t.startLive}
        </button>
        {(state === 'running') && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hear} onChange={(e) => setHear(e.target.checked)} className="size-4 accent-[var(--signal)]" />
            {t.hear}
          </label>
        )}
      </div>
      <p className="text-sm text-muted">{t.keepGoing}</p>
      {stats && (
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div><dt className="text-sm text-muted">{t.arriving}</dt><dd className="num text-2xl">{Math.round(stats.kbps)} <span className="text-sm">kbps</span></dd></div>
          <div><dt className="text-sm text-muted">{t.lost}</dt><dd className={`num text-2xl ${stats.loss >= 2 ? 'text-loss' : ''}`}>{stats.loss.toFixed(1)}%</dd></div>
          <div><dt className="text-sm text-muted">{t.jitter}</dt><dd className={`num text-2xl ${stats.jitter >= 30 ? 'text-loss' : ''}`}>{Math.round(stats.jitter)} <span className="text-sm">ms</span></dd></div>
          <div><dt className="text-sm text-muted">{t.rtt}</dt><dd className={`num text-2xl ${(stats.rtt ?? 0) >= 300 ? 'text-loss' : ''}`}>{stats.rtt != null ? Math.round(stats.rtt) : '—'} <span className="text-sm">ms</span></dd></div>
        </dl>
      )}
      {state === 'done' && stats && (
        <p className={`rounded-xl border-l-4 bg-surface p-3 ${good ? 'border-win' : 'border-loss'}`}>
          {good
            ? t.liveGood
            : t.liveBad}
        </p>
      )}
      {error && <p role="alert" className="text-loss">{error}</p>}
    </div>
  );
}
