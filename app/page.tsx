import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import BattleRow from '@/components/battle/BattleRow';
import { flagEmoji } from '@/lib/format';
import BadgeChip from '@/components/badges/BadgeChip';
import { getT } from '@/lib/i18n/server';
import type { BattleWithPlayers, DirectoryEntry } from '@/lib/types';

const PLAYER = 'id, username, full_name, avatar_url, country, elo_rating, featured_badge';
const SELECT = `*, challenger:profiles!battles_challenger_id_fkey(${PLAYER}), opponent:profiles!battles_opponent_id_fkey(${PLAYER})`;

export default async function Home() {
  const supabase = await createClient();
  const { t } = await getT();
  const [{ data: { user } }, live, voting, top] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('battles').select(SELECT).in('mode', ['live', 'stage']).in('status', ['active', 'live']).order('starts_at').limit(6),
    supabase.from('battles').select(SELECT).eq('status', 'voting').order('voting_ends_at').limit(6),
    supabase.from('directory_entries').select('*').gt('battles_count', 0).order('elo_rating', { ascending: false }).limit(5),
  ]);
  const liveBattles = (live.data ?? []) as BattleWithPlayers[];
  const votingBattles = (voting.data ?? []) as BattleWithPlayers[];
  const leaders = (top.data ?? []) as DirectoryEntry[];

  const section = (title: string, href: string, items: BattleWithPlayers[], empty: string) => (
    <section className="grid gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-2xl font-bold [font-stretch:112%]">{title}</h2>
        <Link href={href} className="text-sm text-muted underline-offset-4 hover:underline">{t.home.seeAll}</Link>
      </div>
      {items.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((b) => <li key={b.id} className="grid"><BattleRow b={b} viewerId={user?.id} /></li>)}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-line p-6 text-muted">{empty}</p>
      )}
    </section>
  );

  return (
    <main className="mx-auto grid max-w-6xl gap-14 px-4 py-12 sm:px-6">
      <section className="grid gap-5">
        <h1 className="handle max-w-[14ch] text-[clamp(2.75rem,8vw,6rem)] leading-[0.95]">
          {t.home.title}
        </h1>
        <p className="max-w-[56ch] text-lg text-muted">
          {t.home.lead}
        </p>
        <div className="flex flex-wrap gap-3">
          {user ? (
            <Link href="/battles/new" className="rounded-full bg-ink px-6 py-3 text-paper">{t.nav.startBattle}</Link>
          ) : (
            <>
              <Link href="/signup" className="rounded-full bg-ink px-6 py-3 text-paper">{t.home.createProfile}</Link>
              <Link href="/battles?tab=voting" className="rounded-full border border-line px-6 py-3">{t.home.listenVote}</Link>
            </>
          )}
        </div>
      </section>

      {section(t.home.live, '/battles?tab=live', liveBattles, t.home.liveEmpty)}
      {section(t.home.vote, '/battles?tab=voting', votingBattles, t.home.voteEmpty)}

      <section className="grid gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-2xl font-bold [font-stretch:112%]">{t.home.top}</h2>
          <Link href="/ranking" className="text-sm text-muted underline-offset-4 hover:underline">{t.home.fullRanking}</Link>
        </div>
        {leaders.length ? (
          <ol className="grid border-t-2 border-ink">
            {leaders.map((p, i) => (
              <li key={p.id} className="grid grid-cols-[2rem_1fr_auto] items-baseline gap-3 border-b border-line py-3">
                <span className="num text-muted">{i + 1}</span>
                <Link href={`/beatboxers/${p.username}`} className="handle truncate underline-offset-4 hover:underline">
                  <span aria-hidden="true">{flagEmoji(p.country)} </span>@{p.username}
                  {p.featured_badge && <span className="ml-2"><BadgeChip code={p.featured_badge} compact /></span>}
                </Link>
                <span className="num text-xl">{p.elo_rating}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-2xl border border-dashed border-line p-6 text-muted">{t.home.topEmpty}</p>
        )}
      </section>
    </main>
  );
}
