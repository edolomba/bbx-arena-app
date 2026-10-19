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
              <label
                htmlFor={id}
                className="block cursor-pointer rounded-full border border-line bg-surface px-4 py-2 peer-checked:border-ink peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-signal"
              >
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

export default function CreateBattleForm({ defaultOpponent = '' }: { defaultOpponent?: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<'async' | 'live'>('async');
  const [opponent, setOpponent] = useState(defaultOpponent);
  const [roundSeconds, setRoundSeconds] = useState<number>(45);
  const [votingHours, setVotingHours] = useState<number>(12);
  const [startsIn, setStartsIn] = useState<number>(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const id = await createBattle(supabase, { opponent, roundSeconds, mode, votingHours, startsInMinutes: startsIn });
      router.push(`/battles/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The battle wasn’t created. Try again.');
      setBusy(false);
    }
  }

  const modes = [
    { value: 'async' as const, title: 'Take turns', text: 'Each of you records on your own time. People listen and vote whenever they like.' },
    { value: 'live' as const, title: 'Live battle', text: 'Rounds premiere at a set time. Everyone in the room hears them together, then judges.' },
  ];

  return (
    <form onSubmit={onSubmit} className="grid max-w-2xl gap-7">
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm text-muted">Format</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {modes.map((m) => (
            <div key={m.value} className="grid">
              <input type="radio" id={`mode-${m.value}`} name="mode" className="peer sr-only" checked={mode === m.value} onChange={() => setMode(m.value)} />
              <label
                htmlFor={`mode-${m.value}`}
                className="grid cursor-pointer content-start gap-1 rounded-2xl border border-line bg-surface p-4 peer-checked:border-ink peer-checked:shadow-[inset_0_0_0_1px_var(--ink)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-signal"
              >
                <span className="text-lg font-bold [font-stretch:112%]">{m.title}</span>
                <span className="text-sm text-muted">{m.text}</span>
              </label>
            </div>
          ))}
        </div>
      </fieldset>

      <label className="grid gap-1 text-sm">
        <span className="text-muted">Opponent</span>
        <div className="flex max-w-sm items-center rounded-lg border border-line bg-surface focus-within:outline-2 focus-within:outline-signal">
          <span className="pl-3 text-muted">@</span>
          <input
            value={opponent}
            onChange={(e) => setOpponent(e.target.value.replace(/^@/, '').trim())}
            placeholder="handle"
            required={mode === 'live'}
            className="w-full bg-transparent px-1 py-2.5 text-base outline-none"
          />
        </div>
        <span className="text-muted">
          {mode === 'live' ? 'Live battles need a named opponent.' : 'Leave it empty to post an open challenge anyone can take.'}
        </span>
      </label>

      <Segmented name="round" legend="Round length" value={roundSeconds} onChange={setRoundSeconds}
        options={ROUND_DURATIONS.map((s) => ({ value: s, label: `${s} seconds` }))} />

      {mode === 'live' ? (
        <Segmented name="start" legend="Starts" value={startsIn} onChange={setStartsIn}
          options={LIVE_STARTS.map((s) => ({ value: s.minutes, label: s.label }))}
          note="Your opponent has to accept, and both rounds have to be in, before the start. A missing round counts as a forfeit." />
      ) : (
        <p className="text-sm text-muted">You record first. Each battler then has 24 hours to respond.</p>
      )}

      <Segmented name="vote" legend="Voting stays open" value={votingHours} onChange={setVotingHours}
        options={VOTING_HOURS.map((h) => ({ value: h, label: hoursText(h) }))}
        note={mode === 'live' ? 'Counted from the moment the last round finishes playing.' : 'Counted from the moment both rounds are in.'} />

      {error && <p role="alert" className="text-loss">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button disabled={busy} className="rounded-full bg-ink px-6 py-3 text-paper disabled:opacity-60">
          {busy ? 'Creating…' : mode === 'live' ? 'Schedule live battle' : opponent ? 'Send challenge' : 'Post open challenge'}
        </button>
      </div>
    </form>
  );
}
