import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import EventCard from '@/components/events/EventCard';
import type { EventRow } from '@/lib/types';

export const metadata = { title: 'Events' };

export default async function EventsPage() {
  const supabase = await createClient();
  const [{ data: open }, { data: done }] = await Promise.all([
    supabase.from('events').select('*').in('status', ['registration', 'eliminations', 'judging', 'main']).order('created_at', { ascending: false }).limit(60),
    supabase.from('events').select('*').eq('status', 'finished').order('finished_at', { ascending: false }).limit(30),
  ]);
  const list = (rows: EventRow[] | null, empty: string) => rows?.length ? (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rows.map((e) => <li key={e.id} className="grid"><EventCard e={e} /></li>)}</ul>
  ) : <p className="rounded-2xl border border-dashed border-line p-6 text-muted">{empty}</p>;

  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <h1 className="handle text-[clamp(2.5rem,7vw,4.5rem)] leading-none">Events</h1>
          <p className="text-muted">Tournaments with live eliminations, judges and a bracket. They can run over several days.</p>
        </div>
        <Link href="/events/new" className="rounded-full bg-ink px-5 py-2.5 text-paper">Create an event</Link>
      </header>
      <section className="grid gap-4">
        <h2 className="flex items-center gap-2 text-xl font-bold [font-stretch:112%]"><span className="size-2.5 rounded-full bg-sub" aria-hidden="true" />Open</h2>
        {list(open as EventRow[] | null, 'No events open right now. Create the first one.')}
      </section>
      <section className="grid gap-4">
        <h2 className="flex items-center gap-2 text-xl font-bold [font-stretch:112%]"><span className="size-2.5 rounded-full bg-win" aria-hidden="true" />Finished</h2>
        {list(done as EventRow[] | null, 'No finished events yet.')}
      </section>
    </main>
  );
}
