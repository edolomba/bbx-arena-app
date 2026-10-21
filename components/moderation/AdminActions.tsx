'use client';

import { useI18n } from '@/components/i18n/I18nProvider';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Props {
  reportId: string;
  status: 'open' | 'resolved' | 'dismissed';
  battle: { id: string; hidden: boolean } | null;
  users: { id: string; username: string; suspended: boolean }[];
}

/** Moderator controls for one report. Every action is checked again in the database. */
export default function AdminActions({ reportId, status, battle, users }: Props) {
  const t = useI18n().t.admin;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) setError(error.message);
    else router.refresh();
  }

  const btn = 'rounded-full border border-line px-3 py-1.5 text-sm hover:border-ink disabled:opacity-50';
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {battle && (
          <button disabled={busy} className={btn}
            onClick={() => run('admin_set_battle_hidden', { p_battle: battle.id, p_hidden: !battle.hidden, p_reason: note || null })}>
            {battle.hidden ? t.showBattle : t.hideBattle}
          </button>
        )}
        {users.map((u) => (
          <button key={u.id} disabled={busy} className={btn}
            onClick={() => run('admin_set_suspended', { p_profile: u.id, p_suspended: !u.suspended, p_reason: note || null })}>
            {u.suspended ? t.unsuspend(u.username) : t.suspend(u.username)}
          </button>
        ))}
      </div>
      {status === 'open' && (
        <div className="flex flex-wrap items-center gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.notePh}
            className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-1.5 text-sm" />
          <button disabled={busy} className="rounded-full bg-ink px-3 py-1.5 text-sm text-paper disabled:opacity-50"
            onClick={() => run('admin_resolve_report', { p_report: reportId, p_status: 'resolved', p_note: note || null })}>
            {t.markResolved}
          </button>
          <button disabled={busy} className={btn}
            onClick={() => run('admin_resolve_report', { p_report: reportId, p_status: 'dismissed', p_note: note || null })}>
            {t.dismiss}
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-loss">{error}</p>}
    </div>
  );
}
