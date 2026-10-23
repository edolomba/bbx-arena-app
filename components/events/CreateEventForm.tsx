'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { eventRpc } from '@/lib/supabase/events';
import { useI18n } from '@/components/i18n/I18nProvider';

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

export default function CreateEventForm({ groupId }: { groupId: string }) {
  const c = useI18n().t.evNew;
  const g = useI18n().t.evg;
  const tg = useI18n().t.tag;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState('Open');
  const [kind, setKind] = useState<'solo' | 'tag'>('solo');
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
      await eventRpc(supabase, 'create_category', {
        p_group: groupId, p_category: title, p_audience: description || null, p_kind: kind, p_max_participants: maxP, p_advance_count: advance,
        p_judges: judges.slice(0, judgeCount).map((j) => j.trim()), p_registration_hours: regHours, p_main_format: mainFormat,
        p_showcase_seconds: showcase, p_battle_round_seconds: roundSec, p_battle_rounds: rounds, p_judge_vote_seconds: voteSec,
        p_ranked: ranked,
      });
      router.push(`/events/g/${groupId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : c.failed);
      setBusy(false);
    }
  }

  const advanceOptions = mainFormat === 'seven_to_smoke' ? [8] : [4, 8, 16, 32].filter((n) => n < maxP);

  return (
    <form onSubmit={submit} className="grid max-w-2xl gap-7">
      <label className="grid gap-1 text-sm">
        <span className="text-muted">{g.categoryName}</span>
        <input required maxLength={40} value={title} onChange={(e) => setTitle(e.target.value)} className={field} placeholder={g.categoryNamePh} />
      </label>
      <fieldset className="grid gap-2 text-sm">
        <legend className="mb-1 text-muted">{tg.kind}</legend>
        <div className="flex flex-wrap gap-2">
          {(['solo', 'tag'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)}
              className={`rounded-full border px-4 py-2 ${kind === k ? 'border-gold bg-gold/15 text-gold' : 'border-line text-muted hover:text-ink'}`}>
              {k === 'solo' ? tg.kindSolo : tg.kindTag}
            </button>
          ))}
        </div>
        {kind === 'tag' && <p className="text-muted">{tg.kindTagNote}</p>}
      </fieldset>
      <div className="grid gap-2 text-sm">
        <label className="grid gap-1">
          <span className="text-muted">{g.audience}</span>
          <input maxLength={60} value={description} onChange={(e) => setDescription(e.target.value)} className={field} placeholder={g.audiencePh} />
        </label>
        <div className="flex flex-wrap gap-2">
          {g.audienceSuggestions.map((a) => (
            <button key={a} type="button" onClick={() => setDescription(a)}
              className={`rounded-full border px-3 py-1 ${description === a ? 'border-gold bg-gold/15 text-gold' : 'border-line text-muted hover:text-ink'}`}>{a}</button>
          ))}
        </div>
      </div>

      <Seg name="max" legend={c.maxP} value={maxP}
        onChange={(v) => { setMaxP(v); if (advance >= v) setAdvance([4, 8, 16, 32].filter((n) => n < v).pop() ?? 4); }}
        options={[8, 16, 24, 32, 48, 64].filter((n) => mainFormat !== 'seven_to_smoke' || n > 8).map((n) => ({ value: n, label: String(n) }))} />
      <Seg name="main" legend={c.format} value={mainFormat}
        onChange={(v) => { setMainFormat(v); if (v === 'seven_to_smoke') { setAdvance(8); if (maxP <= 8) setMaxP(16); } }}
        options={[{ value: 'knockout', label: c.knockout }, { value: 'swiss', label: c.swiss }, { value: 'seven_to_smoke', label: c.smoke }]}
        note={mainFormat === 'seven_to_smoke'
          ? c.smokeNote
          : c.bracketNote} />
      <Seg name="adv" legend={c.advance} value={advance} onChange={setAdvance}
        options={advanceOptions.map((n) => ({ value: n, label: c.top(n) }))} />
      <Seg name="reg" legend={c.regOpen} value={regHours} onChange={setRegHours}
        options={[{ value: 24, label: c.day1 }, { value: 72, label: c.days3 }, { value: 168, label: c.week1 }, { value: 336, label: c.weeks2 }]} />

      <section className="grid gap-5 rounded-2xl border border-line p-5">
        <h2 className="text-lg font-bold [font-stretch:112%]">{c.judges}</h2>
        <Seg name="jc" legend={c.panel} value={judgeCount} onChange={setJudgeCount}
          options={[{ value: 3, label: c.judgesN(3) }, { value: 5, label: c.judgesN(5) }]}
          note={c.judgesNote} />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: judgeCount }, (_, i) => (
            <label key={i} className="grid gap-1 text-sm">
              <span className="text-muted">{c.judgeN(i + 1)}</span>
              <div className="flex items-center rounded-lg border border-line bg-surface focus-within:outline-2 focus-within:outline-signal">
                <span className="pl-3 text-muted">@</span>
                <input required value={judges[i]} onChange={(e) => setJudges((js) => js.map((x, j) => (j === i ? e.target.value.replace(/^@/, '').trim() : x)))}
                  className="w-full bg-transparent px-1 py-2.5 outline-none" placeholder={c.handle} />
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="grid gap-5 rounded-2xl border border-line p-5">
        <h2 className="text-lg font-bold [font-stretch:112%]">{c.timing}</h2>
        <Seg name="sc" legend={c.showcaseLen} value={showcase} onChange={setShowcase}
          options={[30, 45, 60, 90, 120].map((s) => ({ value: s, label: `${s} s` }))} />
        <Seg name="rs" legend={c.roundLen} value={roundSec} onChange={setRoundSec}
          options={[30, 45, 60, 90].map((s) => ({ value: s, label: `${s} s` }))} />
        <Seg name="rn" legend={c.roundsPer} value={rounds} onChange={setRounds}
          options={[{ value: 1, label: c.rounds(1) }, { value: 2, label: c.rounds(2) }]} />
        <Seg name="vs" legend={c.voteTime} value={voteSec} onChange={setVoteSec}
          options={[10, 15, 30].map((s) => ({ value: s, label: `${s} s` }))} />
      </section>

      <Seg name="ranked" legend={c.points} value={ranked} onChange={setRanked}
        options={[{ value: false, label: c.casual }, { value: true, label: c.ranked }]}
        note={ranked ? c.rankedNote : c.casualNote} />

      {error && <p role="alert" className="text-loss">{error}</p>}
      <button disabled={busy} className="justify-self-start rounded-full bg-ink px-6 py-3 text-paper disabled:opacity-60">
        {busy ? c.creating : g.createCategory}
      </button>
    </form>
  );
}
