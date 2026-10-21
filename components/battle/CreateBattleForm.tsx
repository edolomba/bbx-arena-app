'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { createBattle } from '@/lib/supabase/battles';
import { LIVE_STARTS, ROUND_DURATIONS, VOTING_HOURS } from '@/lib/constants';
import { hoursText } from '@/lib/format';

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
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted">{label}</span>
      <div className="flex max-w-sm items-center rounded-lg border border-line bg-surface focus-within:outline-2 focus-within:outline-signal">
        <span className="pl-3 text-muted">@</span>
        <input value={value} onChange={(e) => onChange(e.target.value.replace(/^@/, '').trim())} placeholder="handle"
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
      setError(err instanceof Error ? err.message : 'The battle wasn’t created. Try again.');
      setBusy(false);
    }
  }

  const modes = [
    { value: 'async' as const, title: 'Take turns', text: 'Each of you records on your own time. People listen and vote whenever they like.' },
    { value: 'live' as const, title: 'Live premiere', text: 'You both record before a set time. The rounds premiere together for everyone in the room.' },
    { value: 'stage' as const, title: 'Stage, real time', text: 'Mic to mic, run by a host, judged on the spot. Everyone hears it as it happens, in full quality.' },
  ];

  return (
    <form onSubmit={onSubmit} className="grid max-w-2xl gap-7">
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm text-muted">Format</legend>
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

      <Segmented name="who" legend="Opponent" value={who} onChange={setWho}
        options={[{ value: 'named', label: 'Challenge a beatboxer' }, { value: 'open', label: 'Open to anyone' }]}
        note={who === 'open' ? 'Anyone can take the battle. The first to accept becomes your opponent.' : undefined} />
      {who === 'named' && <HandleInput label="Beatboxer to challenge" value={opponent} onChange={setOpponent} required />}

      <Segmented name="round" legend="Round length" value={roundSeconds} onChange={setRoundSeconds}
        options={ROUND_DURATIONS.map((s) => ({ value: s, label: `${s} seconds` }))} />

      {mode === 'stage' && (
        <Segmented name="rounds" legend="Rounds each" value={rounds} onChange={setRounds}
          options={[{ value: 1, label: '1 round' }, { value: 2, label: '2 rounds' }]}
          note="The host calls the rounds: you open, your opponent answers." />
      )}

      {mode !== 'async' ? (
        <Segmented name="start" legend="Starts" value={startsIn} onChange={setStartsIn}
          options={LIVE_STARTS.map((s) => ({ value: s.minutes, label: s.label }))}
          note={mode === 'stage'
            ? 'Your opponent has to accept before the start. Everyone joins the room a few minutes early with headphones.'
            : 'Your opponent has to accept, and both rounds have to be in, before the start. A missing round counts as a forfeit.'} />
      ) : (
        <p className="text-sm text-muted">You record first. Each battler then has 24 hours to respond.</p>
      )}

      {mode === 'stage' && (
        <section className="grid gap-6 rounded-2xl border border-line p-5">
          <h2 className="text-lg font-bold [font-stretch:112%]">Host and judges</h2>

          <Segmented name="host" legend="Who hosts?" value={hostMode} onChange={setHostMode}
            options={[{ value: 'other', label: 'Someone else' }, { value: 'me', label: 'I’ll host' }]}
            note={hostMode === 'me'
              ? 'If you host your own battle it’s Casual: no rating and no ranking points.'
              : 'The host starts each round and the voting. A third-party host keeps the battle Ranked.'} />
          {hostMode === 'other' && <HandleInput label="Host" value={host} onChange={setHost} required />}

          <Segmented name="judges" legend="Judges" value={judgeCount} onChange={setJudgeCount}
            options={[{ value: 3, label: '3 judges' }, { value: 5, label: '5 judges' }, { value: 0, label: 'No judges' }]}
            note={judgeCount === 0 ? 'Without judges, the audience votes after the battle, during the voting window below.' : 'Majority wins. Judges can’t battle or host.'} />
          {judgeCount > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: judgeCount }, (_, i) => (
                <HandleInput key={i} label={`Judge ${i + 1}`} value={judges[i]} required
                  onChange={(v) => setJudges((js) => js.map((x, j) => (j === i ? v : x)))} />
              ))}
              <HandleInput label="Reserve judge (optional)" value={reserve} onChange={setReserve}
                hint="Votes only in place of a judge who doesn’t." />
            </div>
          )}
          {judgeCount > 0 && (
            <Segmented name="jsec" legend="Time for judges to vote" value={judgeSeconds} onChange={setJudgeSeconds}
              options={[10, 15, 30].map((s) => ({ value: s, label: `${s} seconds` }))} />
          )}
        </section>
      )}

      {(mode !== 'stage' || judgeCount === 0) && (
        <Segmented name="vote" legend="Voting stays open" value={votingHours} onChange={setVotingHours}
          options={VOTING_HOURS.map((h) => ({ value: h, label: hoursText(h) }))}
          note={mode === 'async' ? 'Counted from the moment both rounds are in.' : 'Counted from the moment the last round ends.'} />
      )}

      {error && <p role="alert" className="text-loss">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button disabled={busy} className="rounded-full bg-ink px-6 py-3 text-paper disabled:opacity-60">
          {busy ? 'Creating…' : who === 'open' ? 'Post open battle' : mode === 'async' ? 'Send challenge' : `Schedule ${mode === 'stage' ? 'stage' : 'live'} battle`}
        </button>
      </div>
    </form>
  );
}
