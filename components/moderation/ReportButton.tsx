'use client';

import { useI18n } from '@/components/i18n/I18nProvider';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';


/** Small "Report" control that opens an inline form. */
export default function ReportButton({ battleId, profileId, signedIn, label }: {
  battleId?: string; profileId?: string; signedIn: boolean; label?: string;
}) {
  const t = useI18n().t.report;
  const REASONS = [
    { value: 'offensive', label: t.offensive },
    { value: 'harassment', label: t.harassment },
    { value: 'stolen_content', label: t.stolen },
    { value: 'cheating', label: t.cheating },
    { value: 'fake_account', label: t.fake },
    { value: 'other', label: t.other },
  ];
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
    return <p role="status" className="text-sm text-muted">{t.thanks}</p>;
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
        {label ?? t.report}
      </button>
      {open && (
        <form onSubmit={send} className="grid w-full max-w-md gap-3 rounded-2xl border border-line bg-surface p-4">
          <label className="grid gap-1 text-sm">
            <span className="text-muted">{t.whatsWrong}</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-lg border border-line bg-paper px-3 py-2">
              {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted">{t.details}</span>
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={3}
              className="rounded-lg border border-line bg-paper px-3 py-2" placeholder={t.detailsPh} />
          </label>
          {error && <p role="alert" className="text-sm text-loss">{error}</p>}
          <div className="flex gap-3">
            <button disabled={state === 'sending'} className="rounded-full bg-ink px-4 py-2 text-sm text-paper disabled:opacity-60">
              {state === 'sending' ? t.sending : t.send}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-line px-4 py-2 text-sm">{t.cancel}</button>
          </div>
        </form>
      )}
    </div>
  );
}
