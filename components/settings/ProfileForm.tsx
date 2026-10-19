'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { COUNTRY_CODES } from '@/lib/constants';
import { countryName } from '@/lib/format';

interface Initial {
  id: string;
  username: string;
  full_name: string | null;
  country: string | null;
  bio: string | null;
  social_links: Record<string, string>;
}

const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2.5';
const SOCIALS = [
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/…' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@…' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@…' },
  { key: 'x', label: 'X', placeholder: 'https://x.com/…' },
];

export default function ProfileForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [fullName, setFullName] = useState(initial.full_name ?? '');
  const [country, setCountry] = useState(initial.country ?? '');
  const [bio, setBio] = useState(initial.bio ?? '');
  const [links, setLinks] = useState<Record<string, string>>(initial.social_links ?? {});
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  const countries = useMemo(
    () => COUNTRY_CODES.map((c) => ({ c, name: countryName(c) })).sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState('saving');
    setError(null);
    const cleanLinks: Record<string, string> = Object.fromEntries(
      Object.entries(links).map(([k, v]) => [k, v.trim()] as const).filter(([, v]) => v),
    );
    const bad = Object.entries(cleanLinks).find(([, v]) => !/^https:\/\/\S+$/.test(v));
    if (bad) {
      setError(`The ${SOCIALS.find((s) => s.key === bad[0])?.label} link must start with https://`);
      setState('idle');
      return;
    }
    const { error } = await supabase.from('profiles').update({
      full_name: fullName.trim() || null,
      country: country || null,
      bio: bio.trim() || null,
      social_links: cleanLinks,
    }).eq('id', initial.id);
    if (error) {
      setError(error.message);
      setState('idle');
      return;
    }
    setState('saved');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid max-w-xl gap-5">
      <label className="grid gap-1 text-sm">
        <span className="text-muted">Name (optional)</span>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={80} className={field} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">Country</span>
        <select value={country} onChange={(e) => setCountry(e.target.value)} className={field}>
          <option value="">Prefer not to say</option>
          {countries.map(({ c, name }) => <option key={c} value={c}>{name}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">Bio</span>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} rows={4} className={field} />
        <span className="text-muted">{bio.length} / 500</span>
      </label>
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm text-muted">Links</legend>
        {SOCIALS.map((s) => (
          <label key={s.key} className="grid gap-1 text-sm">
            <span>{s.label}</span>
            <input type="url" value={links[s.key] ?? ''} placeholder={s.placeholder}
              onChange={(e) => setLinks((l) => ({ ...l, [s.key]: e.target.value }))} className={field} />
          </label>
        ))}
      </fieldset>
      {error && <p role="alert" className="text-loss">{error}</p>}
      <div className="flex items-center gap-4">
        <button disabled={state === 'saving'} className="rounded-full bg-ink px-6 py-3 text-paper disabled:opacity-60">
          {state === 'saving' ? 'Saving…' : 'Save profile'}
        </button>
        {state === 'saved' && <span role="status" className="text-win">Saved</span>}
      </div>
    </form>
  );
}
