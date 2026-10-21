'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useHiFiRecorder, type Levels } from '@/hooks/useHiFiRecorder';
import WaveformPlayer from './WaveformPlayer';
import { analyzeAudio } from '@/lib/audio/analyze';
import { ACCEPTED_UPLOADS, describeUpload, readWavFormat } from '@/lib/audio/wav';
import { formatDb, formatTime } from '@/lib/format';
import type { PreparedTake } from '@/lib/types';

interface Props {
  maxSeconds: number;
  onSubmit: (take: PreparedTake) => Promise<void> | void;
  submitLabel?: string;
}

type Mode = 'record' | 'upload';

const dbToFraction = (db: number) => Math.max(0, Math.min(1, (db + 60) / 60));

/** Two horizontal meters driven by requestAnimationFrame, no React re-renders per frame. */
function LevelMeters({ getLevels, active }: { getLevels: () => Levels | null; active: boolean }) {
  const fullRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const [clipping, setClipping] = useState(false);
  const clipUntil = useRef(0);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const loop = () => {
      const l = getLevels();
      if (l) {
        fullRef.current?.style.setProperty('transform', `scaleX(${dbToFraction(l.rmsDb + 6)})`);
        subRef.current?.style.setProperty('transform', `scaleX(${dbToFraction(l.subRmsDb + 6)})`);
        const now = performance.now();
        if (l.peakDb > -0.3) clipUntil.current = now + 1500;
        setClipping(now < clipUntil.current);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [getLevels, active]);

  return (
    <div className="grid gap-2">
      {[
        { ref: fullRef, name: 'Input level', color: 'bg-signal' },
        { ref: subRef, name: 'Sub-bass, below 100 Hz', color: 'bg-sub' },
      ].map((m) => (
        <div key={m.name} className="grid grid-cols-[9.5rem_1fr] items-center gap-3 text-sm">
          <span className="text-muted">{m.name}</span>
          <div className="h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
            <div ref={m.ref} className={`h-full origin-left rounded-full ${m.color}`} style={{ transform: 'scaleX(0)' }} />
          </div>
        </div>
      ))}
      <p className={`text-sm ${clipping ? 'text-loss' : 'invisible'}`} role="status">
        Clipping. Move back from the mic or turn your interface gain down.
      </p>
    </div>
  );
}

function TakeDetails({ take }: { take: PreparedTake }) {
  const a = take.analysis;
  const format = take.isLossless
    ? `${take.sourceCodec.startsWith('pcm') ? 'WAV' : 'FLAC'}${take.sampleRate ? `, ${take.sampleRate / 1000} kHz` : ''}${take.bitDepth ? ` ${take.bitDepth}-bit` : ''}`
    : `${take.sourceCodec.toUpperCase()} (compressed file)`;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
      <div>
        <dt className="text-muted">Length</dt>
        <dd className="num text-base">{formatTime(a.durationMs / 1000)}</dd>
      </div>
      <div>
        <dt className="text-muted">Format</dt>
        <dd>{format}{take.channels === 2 ? ', stereo' : ', mono'}</dd>
      </div>
      <div>
        <dt className="text-muted">Sub-bass share</dt>
        <dd className="num text-base text-sub">{Math.round(a.subRatio * 100)}%</dd>
      </div>
      <div>
        <dt className="text-muted">Loudness / peak</dt>
        <dd className="num">
          {formatDb(a.integratedLufs, 'LUFS')} / {formatDb(a.peakDbfs, 'dBFS')}
        </dd>
      </div>
    </dl>
  );
}

export default function AudioRecorder({ maxSeconds, onSubmit, submitLabel = 'Submit round' }: Props) {
  const rec = useHiFiRecorder({ maxSeconds });
  const startRecording = rec.start;
  const [mode, setMode] = useState<Mode>('record');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [uploaded, setUploaded] = useState<PreparedTake | null>(null);
  const [uploadState, setUploadState] = useState<'idle' | 'analyzing'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const take = mode === 'record' ? rec.take : uploaded;
  const previewUrl = useMemo(() => (take ? URL.createObjectURL(take.blob) : null), [take]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // 3-2-1 lead-in so the first sound isn't clipped by reaching for the mic.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      void startRecording();
      return;
    }
    const t = window.setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => window.clearTimeout(t);
  }, [countdown, startRecording]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    setUploaded(null);
    const type = describeUpload(file);
    if (!type) {
      setUploadError('Upload a WAV, FLAC, MP3 or M4A file.');
      return;
    }
    setUploadState('analyzing');
    try {
      const analysis = await analyzeAudio(file);
      if (analysis.durationMs > maxSeconds * 1000 + 500) {
        throw new Error(
          `This file is ${formatTime(analysis.durationMs / 1000)} long. Rounds here are ${maxSeconds} seconds max; trim it and upload again.`,
        );
      }
      const wavFormat = type.ext === 'wav' ? await readWavFormat(file) : null;
      setUploaded({
        blob: file,
        fileExt: type.ext,
        contentType: type.contentType,
        analysis,
        sourceCodec: wavFormat ? `pcm_s${wavFormat.bitDepth}le` : type.codec,
        isLossless: type.lossless,
        sampleRate: wavFormat?.sampleRate ?? null,
        bitDepth: wavFormat?.bitDepth ?? null,
        channels: wavFormat?.channels ?? 1,
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'This file couldn’t be read. Export it again as WAV and retry.');
    } finally {
      setUploadState('idle');
    }
  }

  async function handleSubmit() {
    if (!take) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(take);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'The round wasn’t submitted. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const live = rec.status === 'ready' || rec.status === 'recording';
  const progress = Math.min(1, rec.elapsedMs / (maxSeconds * 1000));

  return (
    <div className="grid gap-5 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div role="tablist" aria-label="How to add your round" className="flex gap-1 self-start rounded-full bg-paper p-1">
        {(['record', 'upload'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-1.5 text-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-signal ${
              mode === m ? 'bg-ink text-paper' : 'text-muted hover:text-ink'
            }`}
          >
            {m === 'record' ? 'Record' : 'Upload a file'}
          </button>
        ))}
      </div>

      {mode === 'record' && !rec.take && (
        <div className="grid gap-5">
          {(rec.status === 'idle' || rec.status === 'error' || rec.status === 'requesting') && (
            <div className="grid gap-3">
              <p className="max-w-prose text-muted">
                Your browser’s voice filters get switched off, so every sound is recorded as you make it: bass, clicks, snares, inward sounds. Headphones help
                if you’ll play a beat while recording.
              </p>
              <button
                type="button"
                onClick={() => rec.prepare()}
                disabled={rec.status === 'requesting'}
                className="justify-self-start rounded-full bg-ink px-5 py-2.5 text-paper outline-offset-2 focus-visible:outline-2 focus-visible:outline-signal disabled:opacity-60"
              >
                {rec.status === 'requesting' ? 'Waiting for permission…' : 'Turn on microphone'}
              </button>
            </div>
          )}

          {live && (
            <>
              {rec.devices.length > 1 && (
                <label className="grid gap-1 text-sm">
                  <span className="text-muted">Microphone</span>
                  <select
                    value={rec.deviceId}
                    onChange={(e) => rec.selectDevice(e.target.value)}
                    disabled={rec.status === 'recording'}
                    className="rounded-lg border border-line bg-paper px-3 py-2"
                  >
                    {rec.devices.map((d, i) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Input ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <LevelMeters getLevels={rec.getLevels} active={live} />

              {rec.warnings.length > 0 && (
                <ul className="grid gap-1 rounded-lg border border-sub/40 bg-sub/5 p-3 text-sm">
                  {rec.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-5">
                {rec.status === 'recording' ? (
                  <button
                    type="button"
                    onClick={() => rec.stop()}
                    className="grid size-16 place-items-center rounded-full border-4 border-sub outline-offset-2 focus-visible:outline-2 focus-visible:outline-signal"
                    aria-label="Stop recording"
                  >
                    <span className="size-5 rounded-sm bg-sub" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCountdown(3)}
                    disabled={countdown !== null}
                    className="grid size-16 place-items-center rounded-full border-4 border-ink outline-offset-2 focus-visible:outline-2 focus-visible:outline-signal disabled:opacity-60"
                    aria-label="Start recording"
                  >
                    <span className="size-8 rounded-full bg-sub" />
                  </button>
                )}

                <div className="grid min-w-48 flex-1 gap-2">
                  <p className="num text-2xl" aria-live="polite">
                    {countdown !== null
                      ? `Starting in ${countdown}`
                      : `${formatTime(rec.elapsedMs / 1000)} / ${formatTime(maxSeconds)}`}
                  </p>
                  <div className="h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
                    <div className="h-full bg-ink" style={{ width: `${progress * 100}%` }} />
                  </div>
                  <p className="text-sm text-muted">Recording stops by itself at {maxSeconds} seconds.</p>
                </div>
              </div>
            </>
          )}

          {rec.status === 'processing' && <p role="status">Preparing your take…</p>}
          {rec.error && <p className="text-loss" role="alert">{rec.error}</p>}
        </div>
      )}

      {mode === 'upload' && !uploaded && (
        <div className="grid gap-3">
          <label className="grid cursor-pointer place-items-center gap-2 rounded-xl border-2 border-dashed border-line px-6 py-10 text-center focus-within:outline-2 focus-within:outline-signal">
            <span className="text-lg">Choose an audio file</span>
            <span className="max-w-prose text-sm text-muted">
              WAV or FLAC keeps every detail of your sound. MP3 and M4A work too, but anything their encoder already
              removed can’t come back. Up to {maxSeconds} seconds.
            </span>
            <input
              type="file"
              accept={ACCEPTED_UPLOADS}
              className="sr-only"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>
          {uploadState === 'analyzing' && <p role="status">Reading your file…</p>}
          {uploadError && <p className="text-loss" role="alert">{uploadError}</p>}
        </div>
      )}

      {take && previewUrl && (
        <div className="grid gap-4">
          <WaveformPlayer src={previewUrl} waveform={take.analysis.waveform} durationMs={take.analysis.durationMs} label="your take" />
          <TakeDetails take={take} />
          {!take.isLossless && (
            <p className="text-sm text-muted">
              This is a compressed file. It will be stored exactly as uploaded, with no second round of compression.
            </p>
          )}
          {submitError && <p className="text-loss" role="alert">{submitError}</p>}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-full bg-ink px-5 py-2.5 text-paper outline-offset-2 focus-visible:outline-2 focus-visible:outline-signal disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : submitLabel}
            </button>
            <button
              type="button"
              onClick={() => (mode === 'record' ? rec.reset() : setUploaded(null))}
              disabled={submitting}
              className="rounded-full border border-line px-5 py-2.5 outline-offset-2 focus-visible:outline-2 focus-visible:outline-signal"
            >
              {mode === 'record' ? 'Record again' : 'Choose another file'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
