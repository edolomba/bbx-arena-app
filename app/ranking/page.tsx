import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { flagEmoji, formatDate, formatRemaining } from '@/lib/format';
import type { LeaderboardRow, ScoringRules, Season } from '@/lib/types';

export const metadata = { title: 'Ranking' };
export const dynamic = 'force-dynamic';

const TABS = {
  week: { label: 'This week', period: 'weekly' },
  season: { label: 'Season', period: 'season' },
  all: { label: 'All time', period: 'all' },
} as const;
type Tab = keyof typeof TABS;

const SHOWN = 100;

/** Next Monday 00:00 UTC, when the weekly board resets. */
function nextWeeklyReset(now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysToMonday = ((8 - d.getUTCDay()) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + daysToMonday);
  return d;
}

const pts = (n: number) => `${n > 0 ? '' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('en')}`;

function Row({ r, me }: { r: LeaderboardRow; me: boolean }) {
  return (
    <tr
      id={me ? 'me' : undefined}
      aria-current={me ? 'true' : undefined}
      className={`border-b border-line ${me ? 'bg-sub/10 shadow-[inset_4px_0_0_var(--sub)]' : ''}`}
    >
      <td className={`num py-3 pr-3 pl-3 text-right ${r.rank <= 3 ? 'text-2xl' : 'text-lg text-muted'}`}>{r.rank}</td>
      <td className="py-3 pr-3">
        <Link href={`/beatboxers/${r.username}`} className="handle underline-offset-4 hover:underline">
          <span aria-hidden="true">{flagEmoji(r.country)} </span>@{r.username}
        </Link>
        {me && <span className="ml-2 rounded-full bg-sub px-2 py-0.5 text-xs font-bold text-paper">You</span>}
      </td>
      <td className="num py-3 pr-3 text-right text-xl">{pts(r.points)}</td>
      <td className="num py-3 pr-3 text-right">{r.battles}</td>
      <td className="num py-3 pr-3 text-right">{r.wins}</td>
    </tr>
  );
}

export default async function RankingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: rawTab } = await searchParams;
  const tab: Tab = rawTab && rawTab in TABS ? (rawTab as Tab) : 'week';
  const period = TABS[tab].period;
  const nowIso = new Date().toISOString();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [boardRes, meRes, seasonRes, rulesRes] = await Promise.all([
    supabase.rpc('leaderboard', { p_period: period, p_limit: SHOWN, p_offset: 0 }),
    user ? supabase.rpc('my_leaderboard_position', { p_period: period }) : Promise.resolve({ data: null }),
    supabase.from('seasons').select('*').lte('starts_at', nowIso).gt('ends_at', nowIso)
      .order('starts_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('scoring_rules').select('win, loss, draw, forfeit, forfeit_win').maybeSingle(),
  ]);

  const board = (boardRes.data ?? []) as LeaderboardRow[];
  const mine = ((meRes.data ?? []) as LeaderboardRow[])[0] ?? null;
  const season = seasonRes.data as Season | null;
  const rules = rulesRes.data as ScoringRules | null;
  const meInList = mine != null && board.some((r) => r.profile_id === mine.profile_id);

  let periodNote: string;
  if (tab === 'week') periodNote = `Since Monday 00:00 UTC. Resets in ${formatRemaining(nextWeeklyReset().getTime() - Date.now())}.`;
  else if (tab === 'season')
    periodNote = season
      ? `${season.name}, ${formatDate(season.starts_at)} to ${formatDate(season.ends_at)}. Ends in ${formatRemaining(new Date(season.ends_at).getTime() - Date.now())}.`
      : 'No season is running right now.';
  else periodNote = 'Every finished battle since launch.';

  const emptyText =
    tab === 'season' && !season ? 'The next season hasn’t started yet.'
    : tab === 'week' ? 'Nobody has finished a battle this week yet. The first win takes the top spot.'
    : 'No finished battles yet.';

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6">
      <header className="grid gap-2">
        <h1 className="handle text-[clamp(2.5rem,7vw,4.5rem)] leading-none">Ranking</h1>
        <p className="text-muted">Points for battles, never for votes.</p>
      </header>

      <nav aria-label="Ranking period" className="flex flex-wrap gap-1">
        {(Object.keys(TABS) as Tab[]).map((key) => (
          <Link
            key={key}
            href={key === 'week' ? '/ranking' : `/ranking?tab=${key}`}
            aria-current={key === tab ? 'page' : undefined}
            className={`rounded-full px-4 py-1.5 text-sm ${key === tab ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}
          >
            {TABS[key].label}
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-sm text-muted">{periodNote}</p>
        {mine && meInList && mine.rank > 8 && (
          <a href="#me" className="text-sm underline underline-offset-4">Jump to my position (#{mine.rank})</a>
        )}
      </div>

      {/* The signed-in player's standing, always visible above the table */}
      {user && (
        mine ? (
          <section aria-label="Your position" className="flex flex-wrap items-baseline gap-x-8 gap-y-2 border-y-2 border-sub py-4">
            <p className="text-muted">Your position</p>
            <p className="num text-4xl leading-none">#{mine.rank}</p>
            <p><span className="num text-2xl">{pts(mine.points)}</span> <span className="text-muted">points</span></p>
            <p className="text-muted"><span className="num text-ink">{mine.battles}</span> battles, <span className="num text-ink">{mine.wins}</span> wins</p>
          </section>
        ) : (
          <section aria-label="Your position" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-line p-4">
            <p className="text-muted">
              {tab === 'week' ? 'You haven’t finished a battle this week.' : tab === 'season' ? 'You haven’t finished a battle this season.' : 'You haven’t finished a battle yet.'}
            </p>
            <Link href="/battles/new" className="rounded-full bg-ink px-5 py-2 text-paper">Start a battle</Link>
          </section>
        )
      )}
      {!user && (
        <p className="text-muted">
          <Link href="/login?next=/ranking" className="text-ink underline underline-offset-4">Log in</Link> to see your position.
        </p>
      )}

      {board.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-8 text-muted">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse">
            <thead>
              <tr className="border-b-2 border-ink text-left text-xs text-muted">
                <th scope="col" className="w-16 py-2 pr-3 pl-3 text-right font-semibold">Rank</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Beatboxer</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Points</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Battles</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Wins</th>
              </tr>
            </thead>
            <tbody>
              {board.map((r) => <Row key={r.profile_id} r={r} me={r.profile_id === user?.id} />)}
              {mine && !meInList && (
                <>
                  <tr aria-hidden="true"><td colSpan={5} className="py-1 text-center text-muted">⋯</td></tr>
                  <Row r={mine} me />
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {rules && (
        <section className="grid gap-3">
          <h2 className="text-xl font-bold [font-stretch:112%]">How points work</h2>
          <dl className="grid grid-cols-2 border-t-2 border-ink sm:grid-cols-5">
            {[
              ['Win', rules.win],
              ['Loss (round delivered)', rules.loss],
              ['Draw', rules.draw],
              ['Win by forfeit', rules.forfeit_win],
              ['Forfeit (missed deadline)', rules.forfeit],
            ].map(([label, value]) => (
              <div key={label as string} className="border-b border-line py-3 pr-3">
                <dt className="text-sm text-muted">{label}</dt>
                <dd className={`num text-2xl ${(value as number) < 0 ? 'text-loss' : ''}`}>{(value as number) > 0 ? '+' : ''}{pts(value as number)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted">
            Voting never earns points, and battles with no votes score nothing for either side. Ties share a rank.
            Ratings (Elo) are separate and still move with every result.
          </p>
        </section>
      )}
    </main>
  );
}
