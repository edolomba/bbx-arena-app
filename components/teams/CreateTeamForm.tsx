'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';

export default function CreateTeamForm() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const t = useI18n().t.teams;
  const [name, setName] = useState('');
  const [partner, setPartner] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { data, error: err } = await supabase.rpc('create_team', { p_name: name, p_partner: partner });
    setBusy(false);
    if (err) return setError(err.message);
    router.push(`/teams/${data}`);
  }
  const field = 'w-full rounded-lg border border-line bg-paper px-3 py-2.5';
  return (
    <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-xl font-bold [font-stretch:112%]">{t.create}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm"><span className="text-muted">{t.name}</span>
          <input required minLength={2} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePh} className={field} /></label>
        <label className="grid gap-1 text-sm"><span className="text-muted">{t.partner}</span>
          <input required value={partner} onChange={(e) => setPartner(e.target.value)} placeholder={t.partnerPh} className={field} autoCapitalize="none" autoCorrect="off" /></label>
      </div>
      {error && <p role="alert" className="text-loss">{error}</p>}
      <button disabled={busy} className="justify-self-start rounded-full bg-ink px-6 py-2.5 text-paper disabled:opacity-60">{busy ? t.sending : t.send}</button>
    </form>
  );
}
