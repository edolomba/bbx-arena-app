import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import EventCard from '@/components/events/EventCard';
import BattleRow from '@/components/battle/BattleRow';
import type { BattleWithPlayers, EventRow } from '@/lib/types';
import { getT } from '@/lib/i18n/server';

export const metadata = { title: 'My events' };
const PLAYER = 'id, username, full_name, avatar_url, country, elo_rating, featured_badge';

export default async function MyEventsPage() {
  const supabase = await createClient();
  const { t } = await getT();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/my-events');

  const [{ data: hosted }, { data: judging }, { data: entered }, { data: battles }] = await Promise.all([
    supabase.from('events').select('*').eq('host_id', user.id),
    supabase.from('event_judges').select('event:events(*)').eq('judge_id', user.id).eq('active', true),
    supabase.from('event_entries').select('status, event:events(*)').eq('profile_id', user.id).neq('status', 'withdrawn'),
    supabase.from('battles')
      .select(`*, challenger:profiles!battles_challenger_id_fkey(${PLAYER}), opponent:profiles!battles_opponent_id_fkey(${PLAYER})`)
      .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id},host_id.eq.${user.id}`)
      .order('created_at', { ascending: false }).limit(60),
  ]);

  const roles = new Map<string, { e: EventRow; role: string }>();
  for (const e of (hosted ?? []) as EventRow[]) roles.set(e.id, { e, role: t.ev.roleHost });
  for (const r of (judging ?? []) as unknown as { event: EventRow }[]) if (r.event) roles.set(r.event.id, { e: r.event, role: t.ev.roleJudge });
  for (const r of (entered ?? []) as unknown as { status: string; event: EventRow }[]) {
    if (!r.event) continue;
    const label = r.status === 'qualified' ? t.ev.roleQualified : r.status === 'eliminated' ? t.ev.roleCompeted : r.status === 'removed' ? t.ev.roleRemoved : t.ev.roleCompeting;
    roles.set(r.event.id, { e: r.event, role: label });
  }
  const all = [...roles.values()].sort((a, b) => +new Date(b.e.created_at) - +new Date(a.e.created_at));
  const openEvents = all.filter((x) => !['finished', 'cancelled'].includes(x.e.status));
  const doneEvents = all.filter((x) => ['finished', 'cancelled'].includes(x.e.status));
  const bs = (battles ?? []) as BattleWithPlayers[];
  const openBattles = bs.filter((b) => !['finished', 'cancelled'].includes(b.status));
  const doneBattles = bs.filter((b) => ['finished', 'cancelled'].includes(b.status)).slice(0, 12);

  const heading = (open: boolean, text: string) => (
    <h2 className="flex items-center gap-2 text-xl font-bold [font-stretch:112%]">
      <span className={`size-2.5 rounded-full ${open ? 'bg-sub' : 'bg-win'}`} aria-hidden="true" />{text}
    </h2>
  );
  const empty = (t: string) => <p className="rounded-2xl border border-dashed border-line p-5 text-muted">{t}</p>;

  return (
    <main className="mx-auto grid max-w-6xl gap-12 px-4 py-10 sm:px-6">
      <h1 className="handle text-[clamp(2.5rem,7vw,4.5rem)] leading-none">{t.ev.myEvents}</h1>

      <section className="grid gap-4">
        {heading(true, t.ev.open)}
        {openEvents.length || openBattles.length ? (
          <>
            {openEvents.length > 0 && <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{openEvents.map(({ e, role }) => <li key={e.id} className="grid"><EventCard e={e} role={role} /></li>)}</ul>}
            {openBattles.length > 0 && <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{openBattles.map((b) => <li key={b.id} className="grid"><BattleRow b={b} viewerId={user.id} /></li>)}</ul>}
          </>
        ) : empty(t.ev.myNoneOpen)}
      </section>

      <section className="grid gap-4">
        {heading(false, t.ev.finished)}
        {doneEvents.length || doneBattles.length ? (
          <>
            {doneEvents.length > 0 && <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{doneEvents.map(({ e, role }) => <li key={e.id} className="grid"><EventCard e={e} role={role} /></li>)}</ul>}
            {doneBattles.length > 0 && <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{doneBattles.map((b) => <li key={b.id} className="grid"><BattleRow b={b} viewerId={user.id} /></li>)}</ul>}
          </>
        ) : empty(t.ev.myNoneFinished)}
      </section>
    </main>
  );
}
