'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';

/** Tag Team category: register one of my fixed Tag Teams. */
export default function TeamRegister({ eventId, userId }: { eventId: string; userId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const t = useI18n().t.tag;
  const [teams, setTeams] = useState<{ id: string; name: string }[] | null>(null);
  const [team, setTeam] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void supabase.from('team_members').select('team:teams!inner(id, name, status)').eq('profile_id', userId).eq('status', 'active')
      .then(({ data }) => {
        const list = ((data ?? []) as unknown as { team: { id: string; name: string; status: string } }[]).filter((r) => r.team.status === 'active').map((r) => r.team);
        setTeams(list);
        if (list[0]) setTeam(list[0].id);
      });
  }, [supabase, userId]);
  if (teams === null) return null;
  if (!teams.length) return <p className="text-muted">{t.noTeamToRegister} <Link href="/teams" className="underline underline-offset-4">{t.createTeam}</Link></p>;
  async function register() {
    setBusy(true);
    setError('');
    const { error: err } = await supabase.rpc('register_event_team', { p_event: eventId, p_team: team });
    setBusy(false);
    if (err) return setError(err.message);
    router.refresh();
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={team} onChange={(e) => setTeam(e.target.value)} className="rounded-full border border-line bg-surface px-4 py-3">
        {teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <button disabled={busy || !team} onClick={register} className="rounded-full bg-ink px-6 py-3 text-paper disabled:opacity-60">{t.registerWith} {teams.find((x) => x.id === team)?.name}</button>
      {error && <p role="alert" className="w-full text-loss">{error}</p>}
    </div>
  );
}
