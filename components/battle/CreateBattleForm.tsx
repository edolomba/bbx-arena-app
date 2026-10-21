'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { createBattle } from '@/lib/supabase/battles';
import { LIVE_STARTS, ROUND_DURATIONS, VOTING_HOURS } from '@/lib/constants';
import { useI18n } from '@/components/i18n/I18nProvider';

function Segmented<T extends string | number>({
  name, legend, options, value, onChange, note,
}: {
  name: string; legend: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; note?: string;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm text-muted">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const id = `${name}-${o.value}`;
          return (
            <div key={id}>
              <input type="radio" id={id} name={name} className="peer sr-only" checked={value === o.value} onChange={() => onChange(o.value)} />
              <label htmlFor={id}
                className="block cursor-pointer rounded-full border border-line bg-surface px-4 py-2 peer-checked:border-ink peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-signal">
                {o.label}
              </label>
            </div>
          );
        })}
      </div>
      {note && <p className="text-sm text-muted">{note}</p>}
    </fieldset>
  );
}

function HandleInput({ label, value, onChange, required, hint }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; hint?: string;
}) {
  const { t } = useI18n();
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted">{label}</span>
      <div className="flex max-w-sm items-center rounded-lg border border-line bg-surface focus-within:outline-2 focus-within:outline-signal">
        <span className="pl-3 text-muted">@</span>
        <input value={value} onChange={(e) => onChange(e.target.value.replace(/^@/, '').trim())} placeholder={t.create.handlePlaceholder}
          required={required} className="w-full bg-transparent px-1 py-2.5 text-base outline-none" />
      </div>
      {hint && <span className="text-muted">{hint}</span>}
    </label>
  );
}

type Mode = 'async' | 'live' | 'stage';

export default function CreateBattleForm({ defaultOpponent = '' }: { defaultOpponent?: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const c = useI18n().t.create;
  const [mode, setMode] = useState<Mode>('async');
  const [who, setWho] = useState<'named' | 'open'>(defaultOpponent ? 'named' : 'named');
  const [opponent, setOpponent] = useState(defaultOpponent);
  const [roundSeconds, setRoundSeconds] = useState<number>(45);
  const [rounds, setRounds] = useState<number>(1);
  const [votingHours, setVotingHours] = useState<number>(12);
  const [startsIn, setStartsIn] = useState<number>(60);
  const [hostMode, setHostMode] = useState<'me' | 'other'>('other');
  const [host, setHost] = useState('');
  const [judgeCount, setJudgeCount] = useState<number>(3);
  const [judges, setJudges] = useState<string[]>(['', '', '', '', '']);
  const [reserve, setReserve] = useState('');
  const [judgeSeconds, setJudgeSeconds] = useState<number>(15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const id = await createBattle(supabase, {
        opponent: who === 'open' ? '' : opponent,
        roundSeconds, mode, votingHours, startsInMinutes: startsIn,
        rounds: mode === 'stage' ? rounds : 1,
        host: mode === 'stage' && hostMode === 'other' ? host : undefined,
        judges: mode === 'stage' ? judges.slice(0, judgeCount).filter(Boolean) : undefined,
        reserveJudge: mode === 'stage' && judgeCount > 0 ? reserve : undefined,
        judgeSeconds,
      });
      router.push(`/battles/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : c.failed);
      setBusy(false);
    }
  }

  const modes = [
    { value: 'async' as const, title: c.asyncTitle, text: c.asyncText },
    { value: 'live' as const, title: c.liveTitle, text: c.liveText },
    { value: 'stage' as const, title: c.stageTitle, text: c.stageText },
  ];

  return (
    <form onSubmit={onSubmit} className="grid max-w-2xl gap-7">
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm text-muted">{c.format}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {modes.map((m) => (
            <div key={m.value} className="grid">
              <input type="radio" id={`mode-${m.value}`} name="mode" className="peer sr-only" checked={mode === m.value} onChange={() => setMode(m.value)} />
              <label htmlFor={`mode-${m.value}`}
                className="grid cursor-pointer content-start gap-1 rounded-2xl border border-line bg-surface p-4 peer-checked:border-ink peer-checked:shadow-[inset_0_0_0_1px_var(--ink)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-signal">
                <span className="text-lg font-bold [font-stretch:112%]">{m.title}</span>
                <span className="text-sm text-muted">{m.text}</span>
              </label>
            </div>
          ))}
        </div>
      </fieldset>

      <Segmented name="who" legend={c.opponent} value={who} onChange={setWho}
        options={[{ value: 'named', label: c.challengeSomeone }, { value: 'open', label: c.openToAnyone }]}
        note={who === 'open' ? c.openNote : undefined} />
      {who === 'named' && <HandleInput label={c.whoToChallenge} value={opponent} onChange={setOpponent} required />}

      <Segmented name="round" legend={c.roundLength} value={roundSeconds} onChange={setRoundSeconds}
        options={ROUND_DURATIONS.map((s) => ({ value: s, label: c.seconds(s) }))} />

      {mode === 'stage' && (
        <Segmented name="rounds" legend={c.roundsEach} value={rounds} onChange={setRounds}
          options={[{ value: 1, label: c.rounds(1) }, { value: 2, label: c.rounds(2) }]}
          note={c.roundsNote} />
      )}

      {mode !== 'async' ? (
        <Segmented name="start" legend={c.starts} value={startsIn} onChange={setStartsIn}
          options={LIVE_STARTS.map((s) => ({ value: s.minutes, label: ({ 15: c.in15, 60: c.in60, 360: c.in360, 1440: c.in1440 } as Record<number, string>)[s.minutes] ?? s.label }))}
          note={mode === 'stage'
            ? c.stageStartNote
            : c.liveStartNote} />
      ) : (
        <p className="text-sm text-muted">{c.asyncNote}</p>
      )}

      {mode === 'stage' && (
        <section className="grid gap-6 rounded-2xl border border-line p-5">
          <h2 className="text-lg font-bold [font-stretch:112%]">{c.hostAndJudges}</h2>

          <Segmented name="host" legend={c.whoHosts} value={hostMode} onChange={setHostMode}
            options={[{ value: 'other', label: c.someoneElse }, { value: 'me', label: c.iHost }]}
            note={hostMode === 'me'
              ? c.iHostNote
              : c.otherHostNote} />
          {hostMode === 'other' && <HandleInput label={c.host} value={host} onChange={setHost} required />}

          <Segmented name="judges" legend={c.judges} value={judgeCount} onChange={setJudgeCount}
            options={[{ value: 3, label: c.judgesN(3) }, { value: 5, label: c.judgesN(5) }, { value: 0, label: c.noJudges }]}
            note={judgeCount === 0 ? c.noJudgesNote : c.judgesNote} />
          {judgeCount > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: judgeCount }, (_, i) => (
                <HandleInput key={i} label={c.judgeN(i + 1)} value={judges[i]} required
                  onChange={(v) => setJudges((js) => js.map((x, j) => (j === i ? v : x)))} />
              ))}
              <HandleInput label={c.reserve} value={reserve} onChange={setReserve}
                hint={c.reserveHint} />
            </div>
          )}
          {judgeCount > 0 && (
            <Segmented name="jsec" legend={c.judgeTime} value={judgeSeconds} onChange={setJudgeSeconds}
              options={[10, 15, 30].map((s) => ({ value: s, label: c.seconds(s) }))} />
          )}
        </section>
      )}

      {(mode !== 'stage' || judgeCount === 0) && (
        <Segmented name="vote" legend={c.votingOpen} value={votingHours} onChange={setVotingHours}
          options={VOTING_HOURS.map((h) => ({ value: h, label: c.hours(h) }))}
          note={mode === 'async' ? c.votingAsyncNote : c.votingLiveNote} />
      )}

      {error && <p role="alert" className="text-loss">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button disabled={busy} className="rounded-full bg-ink px-6 py-3 text-paper disabled:opacity-60">
          {busy ? c.creating : who === 'open' ? c.postOpen : mode === 'async' ? c.sendChallenge : mode === 'stage' ? c.scheduleStage : c.scheduleLive}
        </button>
      </div>
    </form>
  );
}
