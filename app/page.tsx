import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import BattleRow from '@/components/battle/BattleRow';
import BetaNotice from '@/components/feedback/BetaNotice';
import Podium, { type PodiumRow } from '@/components/ranking/Podium';
import GroupCard from '@/components/events/GroupCard';
import FeaturedStory from '@/components/home/FeaturedStory';
import { getT } from '@/lib/i18n/server';
import type { BattleWithPlayers, EventGroup, EventRow } from '@/lib/types';

const PLAYER = 'id, username, full_name, avatar_url, country, elo_rating, featured_badge';
const SELECT = `*, challenger:profiles!battles_challenger_id_fkey(${PLAYER}), opponent:profiles!battles_opponent_id_fkey(${PLAYER})`;

export default async function Home() {
  const supabase = await createClient();
  const { t } = await getT();
  const nowIso = new Date().toISOString();
  const [{ data: { user } }, live, voting, open, top, groups, nPeople, nBattles, nEvents] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('battles').select(SELECT).in('mode', ['live', 'stage']).in('status', ['active', 'live']).order('starts_at').limit(6),
    supabase.from('battles').select(SELECT).eq('status', 'voting').order('voting_ends_at').limit(6),
    supabase.from('battles').select(SELECT).eq('status', 'open').eq('is_listed', true).order('created_at', { ascending: false }).limit(6),
    supabase.rpc('rating_board', { p_limit: 3 }),
    supabase.from('event_groups').select('*, host:profiles!event_groups_host_id_fkey(username)').gte('ends_at', nowIso).order('starts_at').limit(3),
    supabase.from('directory_entries').select('id', { count: 'exact', head: true }),
    supabase.from('battles').select('id', { count: 'exact', head: true }).eq('status', 'finished'),
    supabase.from('event_groups').select('id', { count: 'exact', head: true }),
  ]);
  const liveBattles = (live.data ?? []) as BattleWithPlayers[];
  const votingBattles = (voting.data ?? []) as BattleWithPlayers[];
  const openBattles = ((open.data ?? []) as BattleWithPlayers[]).filter((b) => b.challenger_id !== user?.id);
  const podium = (top.data ?? []) as PodiumRow[];
  const upcoming = (groups.data ?? []) as EventGroup[];
  const { data: cats } = upcoming.length
    ? await supabase.from('events').select('id, group_id, status, live').in('group_id', upcoming.map((g) => g.id))
    : { data: [] };
  const catsOf = (id: string) => ((cats ?? []) as EventRow[]).filter((c) => c.group_id === id);
  const stats = [
    { n: nPeople.count ?? 0, label: t.home.statsBeatboxers },
    { n: nBattles.count ?? 0, label: t.home.statsBattles },
    { n: nEvents.count ?? 0, label: t.home.statsEvents },
  ];

  const heading = (title: string, href?: string, linkText?: string) => (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="text-2xl font-bold [font-stretch:112%]">{title}</h2>
      {href && <Link href={href} className="text-sm text-muted underline-offset-4 hover:underline">{linkText ?? t.home.seeAll}</Link>}
    </div>
  );
  const battles = (title: string, href: string, items: BattleWithPlayers[], empty: string) => (
    <section className="grid gap-4">
      {heading(title, href)}
      {items.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((b) => <li key={b.id} className="grid"><BattleRow b={b} viewerId={user?.id} /></li>)}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-line p-6 text-muted">{empty}</p>
      )}
    </section>
  );

  const steps = [
    { n: '01', icon: '🎤', title: t.home.step1, text: t.home.step1Text },
    { n: '02', icon: '🔥', title: t.home.step2, text: t.home.step2Text },
    { n: '03', icon: '🏆', title: t.home.step3, text: t.home.step3Text },
  ];

  return (
    <main className="mx-auto grid max-w-6xl gap-14 px-4 py-10 sm:px-6">
      <BetaNotice />

      <section className="grid gap-6">
        <h1 className="handle max-w-[16ch] text-[clamp(2.6rem,8vw,5.5rem)] leading-[0.95]">
          {t.home.title}{' '}
          <span className="bg-gradient-to-r from-gold via-gold to-sub bg-clip-text text-transparent">{t.home.titleAccent}</span>
        </h1>
        <p className="max-w-[56ch] text-lg text-muted">{t.home.lead}</p>
        <div className="flex flex-wrap gap-3">
          {user ? (
            <>
              <Link href="/battles/new" className="rounded-full bg-ink px-6 py-3 text-paper">{t.nav.startBattle}</Link>
              <Link href="/battles?tab=voting" className="rounded-full border border-line px-6 py-3">{t.home.listenVote}</Link>
            </>
          ) : (
            <>
              <Link href="/signup" className="rounded-full bg-ink px-6 py-3 text-paper">{t.home.createProfile}</Link>
              <Link href="/battles?tab=voting" className="rounded-full border border-line px-6 py-3">{t.home.listenVote}</Link>
            </>
          )}
        </div>
        {stats.some((s) => s.n > 0) && (
          <dl className="flex flex-wrap gap-x-10 gap-y-3 pt-2">
            {stats.filter((s) => s.n > 0).map((s) => (
              <div key={s.label} className="grid">
                <dt className="sr-only">{s.label}</dt>
                <dd className="num text-3xl font-bold text-gold">{s.n.toLocaleString()}</dd>
                <dd className="label">{s.label}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {!user && (
        <section className="grid gap-5" aria-labelledby="how">
          <h2 id="how" className="text-2xl font-bold [font-stretch:112%]">{t.home.how}</h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {steps.map((s) => (
              <li key={s.n} className="relative grid content-start gap-3 overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-surface-2 to-surface p-6">
                <span className="num pointer-events-none absolute -top-3 right-3 text-7xl font-bold text-gold/10" aria-hidden="true">{s.n}</span>
                <span className="text-3xl" aria-hidden="true">{s.icon}</span>
                <h3 className="text-xl font-bold">{s.title}</h3>
                <p className="text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {podium.length > 0 && (
        <section className="grid gap-5">
          {heading(t.home.topThree, '/ranking', t.home.fullRanking)}
          <Podium rows={podium} />
        </section>
      )}

      <section className="grid gap-4">
        {heading(t.home.upcomingEvents, '/events', t.home.allEvents)}
        {upcoming.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((g) => <li key={g.id}><GroupCard g={g} categories={catsOf(g.id)} /></li>)}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-line p-6 text-muted">{t.home.noUpcoming}</p>
        )}
      </section>

      {battles(t.home.live, '/battles?tab=live', liveBattles, t.home.liveEmpty)}
      {battles(t.battles.tabOpen, '/battles?tab=open', openBattles, t.home.challengeEmpty)}
      {battles(t.home.vote, '/battles?tab=voting', votingBattles, t.home.voteEmpty)}

      <FeaturedStory />
    </main>
  );
}
