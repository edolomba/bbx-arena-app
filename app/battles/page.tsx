import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import BattleRow from '@/components/battle/BattleRow';
import type { BattleWithPlayers } from '@/lib/types';
import { getT } from '@/lib/i18n/server';

const PLAYER = 'id, username, full_name, avatar_url, country, elo_rating, featured_badge';
const SELECT = `*, challenger:profiles!battles_challenger_id_fkey(${PLAYER}), opponent:profiles!battles_opponent_id_fkey(${PLAYER})`;

const TABS = {
  live: { label: 'tabLive', statuses: ['live', 'active'], liveOnly: true },
  voting: { label: 'tabVoting', statuses: ['voting'], liveOnly: false },
  open: { label: 'tabOpen', statuses: ['open'], liveOnly: false },
  progress: { label: 'tabProgress', statuses: ['active', 'pending'], liveOnly: false },
  finished: { label: 'tabFinished', statuses: ['finished'], liveOnly: false },
} as const;

export default async function BattlesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: rawTab } = await searchParams;
  const tab = (rawTab && rawTab in TABS ? rawTab : 'voting') as keyof typeof TABS;
  const t = TABS[tab];
  const supabase = await createClient();
  const { t: tr } = await getT();
  const { data: { user } } = await supabase.auth.getUser();

  let q = supabase.from('battles').select(SELECT).in('status', [...t.statuses]);
  if (t.liveOnly) q = q.in('mode', ['live', 'stage']);
  if (tab === 'progress') q = q.eq('mode', 'async');
  q = tab === 'live' ? q.order('starts_at', { ascending: true }) : q.order('created_at', { ascending: false });
  const { data } = await q.limit(60);
  const battles = (data ?? []) as BattleWithPlayers[];

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="handle text-[clamp(2.5rem,7vw,4.5rem)] leading-none">{tr.battles.title}</h1>
        <Link href="/battles/new" className="rounded-full bg-ink px-5 py-2.5 text-paper">{tr.nav.startBattle}</Link>
      </header>
      <nav aria-label="Battle lists" className="flex flex-wrap gap-1">
        {Object.entries(TABS).map(([key, v]) => (
          <Link
            key={key}
            href={`/battles?tab=${key}`}
            aria-current={key === tab ? 'page' : undefined}
            className={`rounded-full px-4 py-1.5 text-sm ${key === tab ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}
          >
            {tr.battles[v.label]}
          </Link>
        ))}
      </nav>
      {battles.length === 0 ? (
        <div className="grid justify-items-start gap-3 rounded-2xl border border-dashed border-line p-8">
          <p className="text-lg">{tr.battles.empty}</p>
          <Link href="/battles/new" className="underline underline-offset-4">{tr.nav.startBattle}</Link>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {battles.map((b) => (
            <li key={b.id} className="grid"><BattleRow b={b} viewerId={user?.id} /></li>
          ))}
        </ul>
      )}
    </main>
  );
}
