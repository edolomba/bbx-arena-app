'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const REASONS = [
  { value: 'offensive', label: 'Offensive or hateful content' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'stolen_content', label: 'Stolen or someone else’s audio' },
  { value: 'cheating', label: 'Cheating or vote manipulation' },
  { value: 'fake_account', label: 'Fake or impersonating account' },
  { value: 'other', label: 'Something else' },
];

/** Small "Report" control that opens an inline form. */
export default function ReportButton({ battleId, profileId, signedIn, label = 'Report' }: {
  battleId?: string; profileId?: string; signedIn: boolean; label?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('offensive');
  const [details, setDetails] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return <Link href="/login" className="text-sm text-muted underline-offset-4 hover:underline">{label}</Link>;
  }
  if (state === 'sent') {
    return <p role="status" className="text-sm text-muted">Thanks. A moderator will review it.</p>;
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    setError(null);
    const { error } = await supabase.rpc('report_content', {
      p_reason: reason,
      p_battle: battleId ?? null,
      p_profile: profileId ?? null,
      p_details: details || null,
    });
    if (error) {
      setError(error.message);
      setState('idle');
    } else {
      setState('sent');
    }
  }

  return (
    <div className="grid justify-items-start gap-3">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-sm text-muted underline-offset-4 hover:underline">
        {label}
      </button>
      {open && (
        <form onSubmit={send} className="grid w-full max-w-md gap-3 rounded-2xl border border-line bg-surface p-4">
          <label className="grid gap-1 text-sm">
            <span className="text-muted">What’s wrong?</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-lg border border-line bg-paper px-3 py-2">
              {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Details (optional)</span>
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={3}
              className="rounded-lg border border-line bg-paper px-3 py-2" placeholder="Timestamps or links help the moderators." />
          </label>
          {error && <p role="alert" className="text-sm text-loss">{error}</p>}
          <div className="flex gap-3">
            <button disabled={state === 'sending'} className="rounded-full bg-ink px-4 py-2 text-sm text-paper disabled:opacity-60">
              {state === 'sending' ? 'Sending…' : 'Send report'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-line px-4 py-2 text-sm">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
