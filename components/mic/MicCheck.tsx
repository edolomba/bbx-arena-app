'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { LocalAudioTrack, Room, RoomEvent, Track, type RemoteAudioTrack, type RemoteTrack } from 'livekit-client';
import { useHiFiRecorder } from '@/hooks/useHiFiRecorder';
import { decodeToBuffer } from '@/lib/audio/analyze';
import { STAGE_PUBLISH } from '@/lib/live/stage';
import WaveformPlayer from '@/components/audio/WaveformPlayer';
import { formatDb } from '@/lib/format';

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
      if (clips > 20 || a.peakDbfs > -0.3) v.push({ ok: 'bad', title: 'Your sound is clipping', detail: 'Peaks hit the ceiling and distort. Move a little back from the mic or turn your interface gain down.' });
      else if ((a.integratedLufs ?? -70) < -36) v.push({ ok: 'warn', title: 'Very quiet', detail: 'Get closer to the mic or raise the gain. Quiet recordings lose detail.' });
      else v.push({ ok: 'good', title: 'Levels are good', detail: `Loudness ${formatDb(a.integratedLufs, 'LUFS')}, peak ${formatDb(a.peakDbfs, 'dBFS')}, no clipping.` });

      v.push(a.subRatio > 0.04
        ? { ok: 'good', title: 'Low end comes through', detail: 'Bass, kicks and inward sounds reach the recording.' }
        : { ok: 'warn', title: 'Little low end detected', detail: 'If you made bass sounds, your mic may be cutting them. Phone and laptop mics often do; a USB or dynamic mic fixes it.' });
      v.push(highShare > 0.003
        ? { ok: 'good', title: 'Highs come through', detail: 'Clicks, hi-hats and snares keep their detail.' }
        : { ok: 'warn', title: 'Highs sound muffled', detail: 'Clicks and hats lose their bite. Check that nothing covers the mic, and avoid Bluetooth mics.' });
      v.push(floor < -55
        ? { ok: 'good', title: 'Quiet background', detail: Number.isFinite(floor) ? `Background noise around ${formatDb(floor, 'dB')}.` : 'Complete silence between sounds.' }
        : floor < -45
          ? { ok: 'warn', title: 'Some background noise', detail: 'Fans, traffic or room noise are audible between sounds. A quieter room helps.' }
          : { ok: 'bad', title: 'Noisy background', detail: 'Lots of noise between sounds. Find a quieter spot or move the mic away from fans and computers.' });
      const processing = settings && (settings.noiseSuppression || settings.autoGainControl || settings.echoCancellation);
      v.push(processing
        ? { ok: 'bad', title: 'Your browser is still processing the sound', detail: 'Noise suppression or auto gain is on. Use Chrome or Firefox on a computer for the cleanest sound.' }
        : { ok: 'good', title: 'Voice filters are off', detail: 'Your sound goes out as you make it.' });
      setVerdicts(v);
    })();
  }, [rec.take, testing, settings]);

  const startTest = async () => {
    setVerdicts(null);
    setTesting(true);
    rec.reset();
    await rec.start();
  };

  const onOff = (v: boolean | undefined) => (v ? <span className="text-loss">On</span> : <span className="text-win">Off</span>);
  const live = rec.status === 'ready' || rec.status === 'recording' || rec.status === 'processing' || rec.status === 'done';

  return (
    <div className="grid gap-12">
      {/* ---------- 1. microphone ---------- */}
      <section className="grid gap-5">
        <h2 className="text-2xl font-bold [font-stretch:112%]">1. Your microphone</h2>
        {!live ? (
          <div className="grid justify-items-start gap-3">
            <p className="max-w-[60ch] text-muted">Use the mic and headphones you’ll battle with. Nothing is saved or sent anywhere in this step.</p>
            <button onClick={() => rec.prepare()} disabled={rec.status === 'requesting'} className="rounded-full bg-ink px-6 py-3 text-paper disabled:opacity-60">
              {rec.status === 'requesting' ? 'Waiting for permission…' : 'Start the mic check'}
            </button>
            {rec.error && <p role="alert" className="text-loss">{rec.error}</p>}
          </div>
        ) : (
          <>
            {rec.devices.length > 1 && (
              <label className="grid max-w-md gap-1 text-sm">
                <span className="text-muted">Microphone</span>
                <select value={rec.deviceId} onChange={(e) => rec.selectDevice(e.target.value)} disabled={rec.status === 'recording'}
                  className="rounded-lg border border-line bg-surface px-3 py-2">
                  {rec.devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Input ${i + 1}`}</option>)}
                </select>
              </label>
            )}
            <div className="grid max-w-2xl gap-2">
              {[
                { ref: fullRef, label: 'Overall level', color: 'bg-signal' },
                { ref: lowRef, label: 'Low end (bass, kicks)', color: 'bg-sub' },
                { ref: highRef, label: 'Highs (clicks, hats, snares)', color: 'bg-win' },
              ].map((m) => (
                <div key={m.label} className="grid grid-cols-[13rem_1fr] items-center gap-3 text-sm">
                  <span className="text-muted">{m.label}</span>
                  <div className="h-2.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                    <div ref={m.ref} className={`h-full origin-left rounded-full ${m.color}`} style={{ transform: 'scaleX(0)' }} />
                  </div>
                </div>
              ))}
              <p className="text-sm text-muted">Make some bass sounds, then some clicks and hats: each bar should react.</p>
            </div>

            {settings && (
              <dl className="grid max-w-2xl grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                <div><dt className="text-muted">Noise suppression</dt><dd>{onOff(settings.noiseSuppression)}</dd></div>
                <div><dt className="text-muted">Auto gain</dt><dd>{onOff(settings.autoGainControl)}</dd></div>
                <div><dt className="text-muted">Echo cancellation</dt><dd>{onOff(settings.echoCancellation)}</dd></div>
                <div><dt className="text-muted">Sample rate</dt><dd className="num">{settings.sampleRate ? `${settings.sampleRate / 1000} kHz` : '—'}</dd></div>
                <div><dt className="text-muted">Channels</dt><dd className="num">{settings.channelCount ?? '—'}</dd></div>
              </dl>
            )}
            {rec.warnings.length > 0 && (
              <ul className="grid max-w-2xl gap-1 rounded-lg border border-sub/40 bg-sub/5 p-3 text-sm">{rec.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            )}

            <div className="grid justify-items-start gap-3">
              <button onClick={startTest} disabled={rec.status === 'recording' || rec.status === 'processing'} className="rounded-full bg-ink px-6 py-3 text-paper disabled:opacity-60">
                {rec.status === 'recording' ? `Recording… ${Math.ceil(TEST_SECONDS - rec.elapsedMs / 1000)}` : rec.status === 'processing' ? 'Analysing…' : `Record a ${TEST_SECONDS}-second test`}
              </button>
              <p className="text-sm text-muted">Beatbox normally for {TEST_SECONDS} seconds, with a bit of everything, and a moment of silence.</p>
            </div>

            {rec.take && (
              <div className="grid max-w-3xl gap-3">
                <WaveformPlayer src={URL.createObjectURL(rec.take.blob)} waveform={rec.take.analysis.waveform} durationMs={rec.take.analysis.durationMs} label="your test" />
                <p className="text-sm text-muted">Listen back with headphones: this is exactly what the judges get in the replay.</p>
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
        <h2 className="text-2xl font-bold [font-stretch:112%]">2. Your live connection</h2>
        <p className="max-w-[62ch] text-muted">
          On stage your sound travels live to everyone in the room. This sends your mic through the real server, exactly like a battle,
          and measures what arrives.
        </p>
        {!signedIn ? (
          <p><Link href="/login?next=/mic-check" className="underline underline-offset-4">Log in</Link> to test your live connection.</p>
        ) : !live ? (
          <p className="text-muted">Start the mic check above first.</p>
        ) : (
          <LiveTest getStream={rec.getStream} />
        )}
      </section>
    </div>
  );
}

function LiveTest({ getStream }: { getStream: () => MediaStream | null }) {
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
        if (!res.ok) throw new Error(body.error ?? 'The test room couldn’t open.');
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
      if (!source) throw new Error('The microphone isn’t running.');
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
      setError(err instanceof Error ? err.message : 'The live test failed.');
      setState('error');
      stop();
    }
  }

  const good = stats && stats.loss < 2 && stats.jitter < 30 && (stats.rtt ?? 0) < 300;
  return (
    <div className="grid max-w-3xl gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => { stop(); void run(); }} disabled={state === 'connecting' || state === 'running'} className="rounded-full bg-ink px-6 py-3 text-paper disabled:opacity-60">
          {state === 'connecting' ? 'Connecting…' : state === 'running' ? 'Testing for 15 seconds…' : state === 'done' ? 'Test again' : 'Start the live test'}
        </button>
        {(state === 'running') && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hear} onChange={(e) => setHear(e.target.checked)} className="size-4 accent-[var(--signal)]" />
            Hear yourself as the room hears you (headphones only)
          </label>
        )}
      </div>
      <p className="text-sm text-muted">Keep beatboxing during the test so there’s sound to measure.</p>
      {stats && (
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div><dt className="text-sm text-muted">Arriving</dt><dd className="num text-2xl">{Math.round(stats.kbps)} <span className="text-sm">kbps</span></dd></div>
          <div><dt className="text-sm text-muted">Lost packets</dt><dd className={`num text-2xl ${stats.loss >= 2 ? 'text-loss' : ''}`}>{stats.loss.toFixed(1)}%</dd></div>
          <div><dt className="text-sm text-muted">Jitter</dt><dd className={`num text-2xl ${stats.jitter >= 30 ? 'text-loss' : ''}`}>{Math.round(stats.jitter)} <span className="text-sm">ms</span></dd></div>
          <div><dt className="text-sm text-muted">Round trip</dt><dd className={`num text-2xl ${(stats.rtt ?? 0) >= 300 ? 'text-loss' : ''}`}>{stats.rtt != null ? Math.round(stats.rtt) : '—'} <span className="text-sm">ms</span></dd></div>
        </dl>
      )}
      {state === 'done' && stats && (
        <p className={`rounded-xl border-l-4 bg-surface p-3 ${good ? 'border-win' : 'border-loss'}`}>
          {good
            ? 'Your connection can carry a live battle in full quality.'
            : 'Your connection is unstable. Use a cable instead of Wi-Fi, move closer to the router, or close downloads and video calls before you battle.'}
        </p>
      )}
      {error && <p role="alert" className="text-loss">{error}</p>}
    </div>
  );
}
