'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { prepareSquareImage } from '@/lib/image';
import EventLogo from './EventLogo';
import type { EventGroup } from '@/lib/types';

const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2.5';
/** ISO -> value for <input type="datetime-local"> in the viewer's own time zone. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export default function EventGroupForm({ userId, group }: { userId: string; group?: EventGroup }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const t = useI18n().t.evg;
  const fileRef = useRef<HTMLInputElement>(null);
  const day = 86_400_000;
  const [name, setName] = useState(group?.name ?? '');
  const [edition, setEdition] = useState(group?.edition ?? String(new Date().getFullYear()));
  const [organizer, setOrganizer] = useState(group?.organizer ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [startsAt, setStartsAt] = useState(toLocalInput(group?.starts_at ?? new Date(Date.now() + 7 * day).toISOString()));
  const [endsAt, setEndsAt] = useState(toLocalInput(group?.ends_at ?? new Date(Date.now() + 9 * day).toISOString()));
  const [logo, setLogo] = useState<string | null>(group?.logo_url ?? null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onLogo(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    setBusy(true);
    setMsg(null);
    try {
      const blob = await prepareSquareImage(file, 512);
      const path = `${userId}/${crypto.randomUUID()}.${blob.type === 'image/webp' ? 'webp' : 'png'}`;
      const { error } = await supabase.storage.from('event-logos').upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
      if (error) throw error;
      setLogo(supabase.storage.from('event-logos').getPublicUrl(path).data.publicUrl);
    } catch {
      setMsg({ ok: false, text: t.failed });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.rpc('save_event_group', {
      p_group: group?.id ?? null, p_name: name, p_edition: edition, p_organizer: organizer, p_description: description,
      p_starts_at: new Date(startsAt).toISOString(), p_ends_at: new Date(endsAt).toISOString(),
      p_logo_url: logo, p_keep_logo: false,
    });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message || t.failed });
    if (!group) router.push(`/events/g/${data}/categories/new`);
    else { setMsg({ ok: true, text: t.saved }); router.refresh(); }
  }

  return (
    <form onSubmit={submit} className="grid max-w-2xl gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <EventLogo name={name || '?'} url={logo} size="lg" />
        <div className="grid gap-2">
          <span className="font-semibold">{t.logo}</span>
          <span className="text-sm text-muted">{t.logoHint}</span>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="rounded-full border border-line px-4 py-2 text-sm">
              {logo ? t.edit.split(' ')[0] : '+'} {t.logo.toLowerCase()}
            </button>
            {logo && <button type="button" onClick={() => setLogo(null)} className="text-sm text-muted underline underline-offset-4">{t.remove}</button>}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => onLogo(e.target.files?.[0])} />
      </div>

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <label className="grid gap-1 text-sm"><span className="text-muted">{t.name}</span>
          <input required minLength={3} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePh} className={field} /></label>
        <label className="grid gap-1 text-sm"><span className="text-muted">{t.edition}</span>
          <input maxLength={24} value={edition} onChange={(e) => setEdition(e.target.value)} placeholder={t.editionPh} className={field} /></label>
      </div>
      <label className="grid gap-1 text-sm"><span className="text-muted">{t.organizer}</span>
        <input maxLength={80} value={organizer} onChange={(e) => setOrganizer(e.target.value)} placeholder={t.organizerPh} className={field} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm"><span className="text-muted">{t.starts}</span>
          <input type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={field} /></label>
        <label className="grid gap-1 text-sm"><span className="text-muted">{t.ends}</span>
          <input type="datetime-local" required value={endsAt} min={startsAt} onChange={(e) => setEndsAt(e.target.value)} className={field} /></label>
      </div>
      <label className="grid gap-1 text-sm"><span className="text-muted">{t.description}</span>
        <textarea rows={5} maxLength={3000} value={description} onChange={(e) => setDescription(e.target.value)} className={field} /></label>

      {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-win' : 'text-loss'}>{msg.text}</p>}
      <button disabled={busy} className="justify-self-start rounded-full bg-ink px-6 py-3 text-paper disabled:opacity-60">
        {busy ? t.saving : group ? t.save : t.saveAndCategories}
      </button>
    </form>
  );
}
