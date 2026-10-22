'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';
import Avatar from '@/components/Avatar';
import { prepareSquareImage } from '@/lib/image';

const BUCKET = 'avatars';
export default function AvatarUpload({ userId, username, initialUrl }: { userId: string; username: string; initialUrl: string | null }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const t = useI18n().t.avatar;
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Old photos are removed so the folder only ever holds the current one.
  async function clearOld(keep?: string) {
    const { data } = await supabase.storage.from(BUCKET).list(userId);
    const old = (data ?? []).map((f) => `${userId}/${f.name}`).filter((p) => p !== keep);
    if (old.length) await supabase.storage.from(BUCKET).remove(old);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setMsg(null);
    if (!file.type.startsWith('image/')) return setMsg({ ok: false, text: t.notImage });
    if (file.size > 15 * 1024 * 1024) return setMsg({ ok: false, text: t.tooBig });
    setBusy(true);
    try {
      const blob = await prepareSquareImage(file, 512);
      const path = `${userId}/${crypto.randomUUID()}.${blob.type === 'image/webp' ? 'webp' : 'png'}`;
      const { error: up } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
      if (up) throw up;
      const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const { error } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId);
      if (error) throw error;
      await clearOld(path);
      setUrl(publicUrl);
      setMsg({ ok: true, text: t.saved });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: t.failed });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId);
    if (!error) {
      await clearOld();
      setUrl(null);
      router.refresh();
    } else setMsg({ ok: false, text: t.failed });
    setBusy(false);
  }

  return (
    <section className="grid gap-4 rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-xl font-bold [font-stretch:112%]">{t.title}</h2>
      <div className="flex flex-wrap items-center gap-5">
        <Avatar username={username} url={url} size="xl" ring={url ? 'elite' : 'muted'} />
        <div className="grid gap-2">
          <p className="max-w-[46ch] text-sm text-muted">{t.hint}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => input.current?.click()}
              className="rounded-full bg-ink px-5 py-2.5 text-paper disabled:opacity-60">
              {busy ? t.uploading : url ? t.change : t.choose}
            </button>
            {url && !busy && (
              <button type="button" onClick={remove} className="rounded-full border border-line px-5 py-2.5">{t.remove}</button>
            )}
          </div>
          {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-win' : 'text-loss'}`}>{msg.text}</p>}
        </div>
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/*" className="sr-only"
        onChange={(e) => onFile(e.target.files?.[0])} />
    </section>
  );
}
