'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { EventSession } from '@/lib/types';

const field = 'rounded-lg border border-line bg-surface px-3 py-2';
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
type Row = { title: string; category_id: string; starts: string; ends: string };

export default function ScheduleEditor({ groupId, sessions, categories, defaultStart }: {
  groupId: string; sessions: EventSession[]; categories: { id: string; name: string }[]; defaultStart: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const t = useI18n().t.evg;
  const [rows, setRows] = useState<Row[]>(sessions.map((s) => ({ title: s.title, category_id: s.category_id ?? '', starts: toLocalInput(s.starts_at), ends: toLocalInput(s.ends_at) })));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  function add() {
    const last = rows[rows.length - 1];
    const start = last ? new Date(new Date(last.ends).getTime() + 30 * 60000).toISOString() : defaultStart;
    const end = new Date(new Date(start).getTime() + 2 * 3600000).toISOString();
    setRows((r) => [...r, { title: '', category_id: categories[0]?.id ?? '', starts: toLocalInput(start), ends: toLocalInput(end) }]);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const payload = rows.filter((r) => r.title.trim()).map((r) => ({
      title: r.title.trim(), category_id: r.category_id || null,
      starts_at: new Date(r.starts).toISOString(), ends_at: new Date(r.ends).toISOString(),
    }));
    const { error } = await supabase.rpc('save_event_schedule', { p_group: groupId, p_sessions: payload });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: t.scheduleSaved });
    router.refresh();
  }

  return (
    <section className="grid gap-4">
      <h2 className="text-xl font-bold [font-stretch:112%]">{t.editSchedule}</h2>
      <ol className="grid gap-3">
        {rows.map((r, i) => (
          <li key={i} className="grid gap-2 rounded-xl border border-line bg-surface p-3 sm:grid-cols-[2fr_1fr_1.3fr_1.3fr_auto] sm:items-end">
            <label className="grid gap-1 text-sm"><span className="text-muted">{t.sessionTitle}</span>
              <input value={r.title} maxLength={80} onChange={(e) => set(i, { title: e.target.value })} placeholder={t.sessionTitlePh} className={field} /></label>
            <label className="grid gap-1 text-sm"><span className="text-muted">{t.sessionCategory}</span>
              <select value={r.category_id} onChange={(e) => set(i, { category_id: e.target.value })} className={field}>
                <option value="">{t.none}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
            <label className="grid gap-1 text-sm"><span className="text-muted">{t.starts}</span>
              <input type="datetime-local" value={r.starts} onChange={(e) => set(i, { starts: e.target.value })} className={field} /></label>
            <label className="grid gap-1 text-sm"><span className="text-muted">{t.ends}</span>
              <input type="datetime-local" value={r.ends} min={r.starts} onChange={(e) => set(i, { ends: e.target.value })} className={field} /></label>
            <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="pb-2 text-sm text-muted underline underline-offset-4">{t.remove}</button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={add} className="rounded-full border border-line px-4 py-2 text-sm">+ {t.addSession}</button>
        <button type="button" disabled={busy} onClick={save} className="rounded-full bg-ink px-5 py-2 text-paper disabled:opacity-60">{busy ? t.saving : t.saveSchedule}</button>
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-win' : 'text-loss'}>{msg.text}</p>}
    </section>
  );
}
