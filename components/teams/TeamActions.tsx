'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';

/** Invited partner: accept or decline. Members: rename or break up. */
export default function TeamActions({ teamId, name, mode }: { teamId: string; name: string; mode: 'invited' | 'member' }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const t = useI18n().t.teams;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    setError('');
    const { error: err } = await supabase.rpc(fn, args);
    setBusy(false);
    if (err) return setError(err.message);
    setEditing(false);
    router.refresh();
  }
  if (mode === 'invited') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={busy} onClick={() => run('answer_team_invite', { p_team: teamId, p_accept: true })} className="rounded-full bg-ink px-5 py-2 text-paper">{t.accept}</button>
        <button disabled={busy} onClick={() => run('answer_team_invite', { p_team: teamId, p_accept: false })} className="rounded-full border border-line px-5 py-2">{t.decline}</button>
        {error && <p role="alert" className="w-full text-loss">{error}</p>}
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); void run('rename_team', { p_team: teamId, p_name: value }); }} className="flex flex-wrap gap-2">
          <input value={value} minLength={2} maxLength={40} onChange={(e) => setValue(e.target.value)} className="rounded-lg border border-line bg-paper px-3 py-2" />
          <button disabled={busy} className="rounded-full bg-ink px-4 py-2 text-paper">{t.save}</button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2 text-sm">
          <button onClick={() => setEditing(true)} className="rounded-full border border-line px-4 py-2">{t.rename}</button>
          <button disabled={busy} onClick={() => { if (window.confirm(t.confirmLeave)) void run('leave_team', { p_team: teamId }); }}
            className="rounded-full border border-loss/50 px-4 py-2 text-loss">{t.leave}</button>
        </div>
      )}
      {error && <p role="alert" className="text-loss">{error}</p>}
    </div>
  );
}
