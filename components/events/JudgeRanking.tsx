'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { eventRpc } from '@/lib/supabase/events';
import { audioUrl } from '@/lib/supabase/storage';
import WaveformPlayer from '@/components/audio/WaveformPlayer';
import type { EventShowcase } from '@/lib/types';

interface Props {
  eventId: string;
  performers: { profile_id: string; username: string }[];
  showcases: EventShowcase[];
  savedOrder: string[];
  submittedAt: string | null;
}

/**
 * A judge's private ranking. Replay every showcase, give quick draft scores,
 * sort by them, fine-tune with the arrows, save. Editable until the host publishes.
 * Draft scores stay on this device only.
 */
export default function JudgeRanking({ eventId, performers, showcases, savedOrder, submittedAt }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const storageKey = `bbx-judge-draft-${eventId}`;
  const [order, setOrder] = useState<string[]>(() => {
    const ids = performers.map((p) => p.profile_id);
    return savedOrder.length === ids.length ? savedOrder : ids;
  });
  const [scores, setScores] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try { setScores(JSON.parse(localStorage.getItem(storageKey) ?? '{}')); } catch { /* fresh */ }
  }, [storageKey]);
  const setScore = (id: string, v: number) => {
    setScores((s) => {
      const next = { ...s, [id]: v };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* fine */ }
      return next;
    });
  };

  const name = (id: string) => performers.find((p) => p.profile_id === id)?.username ?? 'beatboxer';
  const move = (i: number, d: number) => setOrder((o) => {
    const j = i + d;
    if (j < 0 || j >= o.length) return o;
    const n = [...o];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const sortByScores = () => setOrder((o) => [...o].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0)));

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await eventRpc(supabase, 'judge_save_ranking', { p_event: eventId, p_order: order });
      setMessage('Your ranking is saved. You can still change it until the host publishes.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your ranking wasn’t saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-5" aria-label="Your ranking">
      <div className="grid gap-1">
        <h2 className="text-2xl font-bold [font-stretch:112%]">Your ranking</h2>
        <p className="max-w-[62ch] text-muted">
          Replay the showcases as often as you like. Give each a quick draft score, sort by your scores, then fine-tune the
          order with the arrows. Position 1 is your best. Nobody sees your ranking until the host publishes.
        </p>
        {submittedAt && <p className="text-sm text-win">Saved {new Date(submittedAt).toLocaleString('en-GB')}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={sortByScores} className="rounded-full border border-line px-4 py-2 text-sm">Sort by my draft scores</button>
      </div>

      <ol className="grid gap-3">
        {order.map((id, i) => {
          const sc = showcases.find((s) => s.profile_id === id);
          return (
            <li key={id} className="grid gap-3 rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="num w-10 text-3xl leading-none">{i + 1}</span>
                <span className="handle min-w-0 flex-1 truncate text-lg">@{name(id)}</span>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted">Draft</span>
                  <select value={scores[id] ?? ''} onChange={(e) => setScore(id, Number(e.target.value))}
                    className="rounded-lg border border-line bg-paper px-2 py-1">
                    <option value="">–</option>
                    {Array.from({ length: 10 }, (_, k) => 10 - k).map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
                <span className="flex gap-1">
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move @${name(id)} up`}
                    className="grid size-9 place-items-center rounded-full border border-line disabled:opacity-30">↑</button>
                  <button onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`Move @${name(id)} down`}
                    className="grid size-9 place-items-center rounded-full border border-line disabled:opacity-30">↓</button>
                </span>
              </div>
              {sc ? (
                <WaveformPlayer compact src={audioUrl(sc.audio_path)} waveform={sc.waveform_data} durationMs={sc.duration_ms} label={`@${name(id)} showcase`} />
              ) : (
                <p className="text-sm text-muted">No recording available.</p>
              )}
            </li>
          );
        })}
      </ol>

      {error && <p role="alert" className="text-loss">{error}</p>}
      {message && <p role="status" className="text-win">{message}</p>}
      <button onClick={save} disabled={busy} className="justify-self-start rounded-full bg-ink px-6 py-3 text-paper disabled:opacity-60">
        {busy ? 'Saving…' : submittedAt ? 'Update my ranking' : 'Submit my ranking'}
      </button>
    </section>
  );
}
