import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import GroupCard from '@/components/events/GroupCard';
import type { EventGroup, EventRow } from '@/lib/types';

export const metadata = { title: 'Events' };

export default async function EventsPage() {
  const supabase = await createClient();
  const { t: all } = await getT();
  const t = all.evg;
  const nowIso = new Date().toISOString();
  const [{ data: upcoming }, { data: past }] = await Promise.all([
    supabase.from('event_groups').select('*, host:profiles!event_groups_host_id_fkey(username)').gte('ends_at', nowIso).order('starts_at').limit(60),
    supabase.from('event_groups').select('*, host:profiles!event_groups_host_id_fkey(username)').lt('ends_at', nowIso).order('ends_at', { ascending: false }).limit(30),
  ]);
  const groups = [...((upcoming ?? []) as EventGroup[]), ...((past ?? []) as EventGroup[])];
  const { data: cats } = groups.length
    ? await supabase.from('events').select('id, group_id, status, live').in('group_id', groups.map((g) => g.id))
    : { data: [] };
  const byGroup = new Map<string, EventRow[]>();
  for (const c of (cats ?? []) as EventRow[]) byGroup.set(c.group_id!, [...(byGroup.get(c.group_id!) ?? []), c]);

  const grid = (list: EventGroup[]) => (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((g) => <li key={g.id}><GroupCard g={g} categories={byGroup.get(g.id) ?? []} /></li>)}
    </ul>
  );

  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="handle text-[clamp(2.5rem,7vw,4.5rem)] leading-none">{all.ev.title}</h1>
        <Link href="/events/new" className="rounded-full bg-ink px-5 py-2.5 text-paper">{t.create}</Link>
      </header>
      <section className="grid gap-4">
        <div>
          <h2 className="text-2xl font-bold">{t.comingUp} <span className="num text-base text-muted">({(upcoming ?? []).length})</span></h2>
          <p className="text-sm text-muted">{t.comingLead}</p>
        </div>
        {(upcoming ?? []).length ? grid(upcoming as EventGroup[]) : <p className="rounded-2xl border border-dashed border-line p-6 text-muted">{all.ev.noneOpen}</p>}
      </section>
      {(past ?? []).length > 0 && (
        <section className="grid gap-4">
          <h2 className="text-2xl font-bold">{t.past}</h2>
          {grid(past as EventGroup[])}
        </section>
      )}
    </main>
  );
}
