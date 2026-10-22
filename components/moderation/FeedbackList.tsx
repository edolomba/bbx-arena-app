'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { LOCALE_TAG } from '@/lib/i18n/config';

export interface FeedbackItem {
  id: string; kind: 'bug' | 'idea' | 'other'; message: string; page: string | null; device: string | null;
  status: 'new' | 'read' | 'done'; created_at: string; author: { username: string } | null;
}

export default function FeedbackList({ items }: { items: FeedbackItem[] }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { locale, t: all } = useI18n();
  const t = all.beta;
  const [busy, setBusy] = useState<string | null>(null);
  async function set(id: string, status: FeedbackItem['status']) {
    setBusy(id);
    await supabase.rpc('admin_set_feedback_status', { p_id: id, p_status: status });
    setBusy(null);
    router.refresh();
  }
  if (!items.length) return <p className="text-muted">{t.adminNone}</p>;
  const label = { new: t.statusNew, read: t.statusRead, done: t.statusDone };
  return (
    <ul className="grid gap-3">
      {[...items].sort((a, b) => ({ new: 0, read: 1, done: 2 })[a.status] - ({ new: 0, read: 1, done: 2 })[b.status]).map((f) => (
        <li key={f.id} className={`grid gap-2 rounded-2xl border bg-surface p-4 ${f.status === 'new' ? 'border-gold/40' : 'border-line opacity-80'}`}>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span>{f.kind === 'bug' ? '🐞' : f.kind === 'idea' ? '💡' : '💬'} <strong>{t[f.kind]}</strong></span>
            <span className={`rounded-full border px-2 py-0.5 font-mono text-[0.65rem] uppercase ${f.status === 'new' ? 'border-gold/50 text-gold' : f.status === 'done' ? 'border-win/50 text-win' : 'border-line text-muted'}`}>{label[f.status]}</span>
            {f.author && <Link href={`/beatboxers/${f.author.username}`} className="text-muted underline-offset-4 hover:underline">@{f.author.username}</Link>}
            <span className="font-mono text-xs text-muted">{new Date(f.created_at).toLocaleString(LOCALE_TAG[locale], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          </p>
          <p className="whitespace-pre-wrap">{f.message}</p>
          {f.page && <p className="text-sm text-muted">↳ {f.page}</p>}
          {f.device && <p className="font-mono text-[0.7rem] break-all text-muted">{f.device}</p>}
          <div className="flex flex-wrap gap-2 text-sm">
            {f.status === 'new' && <button disabled={busy === f.id} onClick={() => set(f.id, 'read')} className="rounded-full border border-line px-3 py-1">{t.markRead}</button>}
            {f.status !== 'done' && <button disabled={busy === f.id} onClick={() => set(f.id, 'done')} className="rounded-full bg-ink px-3 py-1 text-paper">{t.markDone}</button>}
            {f.status === 'done' && <button disabled={busy === f.id} onClick={() => set(f.id, 'new')} className="rounded-full border border-line px-3 py-1">{t.reopen}</button>}
          </div>
        </li>
      ))}
    </ul>
  );
}
