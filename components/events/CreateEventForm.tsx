'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { eventRpc } from '@/lib/supabase/events';

function Seg<T extends string | number | boolean>({ name, legend, value, onChange, options, note }: {
  name: string; legend: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; note?: string;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm text-muted">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const id = `${name}-${String(o.value)}`;
          return (
            <div key={id}>
              <input type="radio" id={id} name={name} className="peer sr-only" checked={value === o.value} onChange={() => onChange(o.value)} />
              <label htmlFor={id} className="block cursor-pointer rounded-full border border-line bg-surface px-4 py-2 peer-checked:border-ink peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-signal">{o.label}</label>
            </div>
          );
        })}
      </div>
      {note && <p className="text-sm text-muted">{note}</p>}
    </fieldset>
  );
}

const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2.5';

export default function CreateEventForm() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [maxP, setMaxP] = useState(16);
  const [advance, setAdvance] = useState(8);
  const [mainFormat, setMainFormat] = useState<'knockout' | 'swiss' | 'seven_to_smoke'>('knockout');
  const [judgeCount, setJudgeCount] = useState(3);
  const [judges, setJudges] = useState(['', '', '', '', '']);
  const [showcase, setShowcase] = useState(60);
  const [roundSec, setRoundSec] = useState(45);
  const [rounds, setRounds] = useState(1);
  const [voteSec, setVoteSec] = useState(15);
  const [regHours, setRegHours] = useState(72);
  const [ranked, setRanked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const id = await eventRpc(supabase, 'create_event', {
        p_title: title, p_description: description || null, p_max_participants: maxP, p_advance_count: advance,
        p_judges: judges.slice(0, judgeCount).map((j) => j.trim()), p_registration_hours: regHours, p_main_format: mainFormat,
        p_showcase_seconds: showcase, p_battle_round_seconds: roundSec, p_battle_rounds: rounds, p_judge_vote_seconds: voteSec,
        p_ranked: ranked,
      });
      router.push(`/events/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The event wasn’t created.');
      setBusy(false);
    }
  }

  const advanceOptions = mainFormat === 'seven_to_smoke' ? [8] : [4, 8, 16, 32].filter((n) => n < maxP);

  return (
    <form onSubmit={submit} className="grid max-w-2xl gap-7">
      <label className="grid gap-1 text-sm">
        <span className="text-muted">Event name</span>
        <input required minLength={3} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} className={field} placeholder="e.g. Lisbon Online Cup 2026" />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">Rules and prizes (optional)</span>
        <textarea rows={4} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} className={field} />
      </label>

      <Seg name="max" legend="Beatboxers in the eliminations (maximum)" value={maxP}
        onChange={(v) => { setMaxP(v); if (advance >= v) setAdvance([4, 8, 16, 32].filter((n) => n < v).pop() ?? 4); }}
        options={[8, 16, 24, 32, 48, 64].filter((n) => mainFormat !== 'seven_to_smoke' || n > 8).map((n) => ({ value: n, label: String(n) }))} />
      <Seg name="main" legend="Format" value={mainFormat}
        onChange={(v) => { setMainFormat(v); if (v === 'seven_to_smoke') { setAdvance(8); if (maxP <= 8) setMaxP(16); } }}
        options={[{ value: 'knockout', label: 'Knockout' }, { value: 'swiss', label: 'Swiss rounds' }, { value: 'seven_to_smoke', label: '7 to Smoke' }]}
        note={mainFormat === 'seven_to_smoke'
          ? 'The top 8 line up: winner stays on and scores a point, loser goes to the back. First to 7 wins. With 8 or fewer entrants you can skip the eliminations.'
          : 'Both end with a small final (3rd place) and a final.'} />
      <Seg name="adv" legend="How many go through" value={advance} onChange={setAdvance}
        options={advanceOptions.map((n) => ({ value: n, label: `Top ${n}` }))} />
      <Seg name="reg" legend="Registration stays open" value={regHours} onChange={setRegHours}
        options={[{ value: 24, label: '1 day' }, { value: 72, label: '3 days' }, { value: 168, label: '1 week' }, { value: 336, label: '2 weeks' }]} />

      <section className="grid gap-5 rounded-2xl border border-line p-5">
        <h2 className="text-lg font-bold [font-stretch:112%]">Judges</h2>
        <Seg name="jc" legend="Panel" value={judgeCount} onChange={setJudgeCount}
          options={[{ value: 3, label: '3 judges' }, { value: 5, label: '5 judges' }]}
          note="You host; judges can’t compete. You can replace a judge later if someone drops out." />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: judgeCount }, (_, i) => (
            <label key={i} className="grid gap-1 text-sm">
              <span className="text-muted">Judge {i + 1}</span>
              <div className="flex items-center rounded-lg border border-line bg-surface focus-within:outline-2 focus-within:outline-signal">
                <span className="pl-3 text-muted">@</span>
                <input required value={judges[i]} onChange={(e) => setJudges((js) => js.map((x, j) => (j === i ? e.target.value.replace(/^@/, '').trim() : x)))}
                  className="w-full bg-transparent px-1 py-2.5 outline-none" placeholder="handle" />
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="grid gap-5 rounded-2xl border border-line p-5">
        <h2 className="text-lg font-bold [font-stretch:112%]">Timing</h2>
        <Seg name="sc" legend="Showcase length (eliminations)" value={showcase} onChange={setShowcase}
          options={[30, 45, 60, 90, 120].map((s) => ({ value: s, label: `${s} s` }))} />
        <Seg name="rs" legend="Battle round length" value={roundSec} onChange={setRoundSec}
          options={[30, 45, 60, 90].map((s) => ({ value: s, label: `${s} s` }))} />
        <Seg name="rn" legend="Rounds per battler" value={rounds} onChange={setRounds}
          options={[{ value: 1, label: '1 round' }, { value: 2, label: '2 rounds' }]} />
        <Seg name="vs" legend="Time for judges to vote in battles" value={voteSec} onChange={setVoteSec}
          options={[10, 15, 30].map((s) => ({ value: s, label: `${s} s` }))} />
      </section>

      <Seg name="ranked" legend="Ranking points" value={ranked} onChange={setRanked}
        options={[{ value: false, label: 'Casual' }, { value: true, label: 'Ranked' }]}
        note={ranked ? 'Ranked events award ranking points (1000 / 500 / 350 / 200 / 100) once a moderator approves the event.' : 'Casual events don’t touch the ranking.'} />

      {error && <p role="alert" className="text-loss">{error}</p>}
      <button disabled={busy} className="justify-self-start rounded-full bg-ink px-6 py-3 text-paper disabled:opacity-60">
        {busy ? 'Creating…' : 'Create event and open registration'}
      </button>
    </form>
  );
}
