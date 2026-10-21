'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';

export default function EventApproval({ events }: { events: { id: string; title: string; host: string; max: number }[] }) {
  const t = useI18n().t.admin;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  if (!events.length) return <p className="text-muted">{t.noEvents}</p>;
  async function decide(id: string, approve: boolean) {
    setBusy(true);
    await supabase.rpc('admin_approve_event', { p_event: id, p_approve: approve });
    setBusy(false);
    router.refresh();
  }
  return (
    <ul className="grid gap-3">
      {events.map((e) => (
        <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
          <span><Link href={`/events/${e.id}`} className="font-semibold underline-offset-4 hover:underline">{e.title}</Link>
            <span className="text-muted">{t.eventBy(e.host, e.max)}</span></span>
          <span className="flex gap-2">
            <button disabled={busy} onClick={() => decide(e.id, true)} className="rounded-full bg-ink px-4 py-1.5 text-sm text-paper">{t.approve}</button>
            <button disabled={busy} onClick={() => decide(e.id, false)} className="rounded-full border border-line px-4 py-1.5 text-sm">{t.makeCasual}</button>
          </span>
        </li>
      ))}
    </ul>
  );
}
