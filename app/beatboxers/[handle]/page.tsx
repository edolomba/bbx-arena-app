import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import BattleRow from '@/components/battle/BattleRow';
import RatingChart from '@/components/profile/RatingChart';
import ReportButton from '@/components/moderation/ReportButton';
import BadgeChip from '@/components/badges/BadgeChip';
import BadgeShelf, { type EarnedBadge } from '@/components/badges/BadgeShelf';
import { Avatar } from '@/components/directory/BeatboxerCard';
import { PROVISIONAL_BATTLES } from '@/lib/constants';
import { countryName, flagEmoji, formatAgo, formatDate, formatMonth, signed } from '@/lib/format';
import type { BattleWithPlayers, DirectoryEntry, ProfileBattle } from '@/lib/types';

const PLAYER = 'id, username, full_name, avatar_url, country, elo_rating, featured_badge';
const OUTCOME = { W: 'Won', L: 'Lost', D: 'Drew' } as const;
const resultText = (g: ProfileBattle) =>
  g.result === 'forfeit' ? `${OUTCOME[g.outcome]} by forfeit` : g.outcome === 'D' ? 'Draw' : `${OUTCOME[g.outcome]} by decision`;

const SOCIALS: Record<string, string> = { instagram: 'Instagram', youtube: 'YouTube', tiktok: 'TikTok', x: 'X' };

export default async function ProfilePage({ params, searchParams }: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ all?: string }>;
}) {
  const { handle } = await params;
  const { all } = await searchParams;
  const supabase = await createClient();
  const { data: p } = await supabase.from('directory_entries').select('*').eq('username', decodeURIComponent(handle)).maybeSingle();
  if (!p) notFound();
  const profile = p as DirectoryEntry;

  const [{ data: rows }, { data: liveRows }, { data: auth }, { count: total }, { data: badgeRows }] = await Promise.all([
    supabase.from('profile_battles').select('*').eq('profile_id', profile.id).order('finished_at', { ascending: true }),
    supabase
      .from('battles')
      .select(`*, challenger:profiles!battles_challenger_id_fkey(${PLAYER}), opponent:profiles!battles_opponent_id_fkey(${PLAYER})`)
      .or(`challenger_id.eq.${profile.id},opponent_id.eq.${profile.id}`)
      .in('status', ['open', 'pending', 'active', 'live', 'voting'])
      .order('created_at', { ascending: false }),
    supabase.auth.getUser(),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profile_badges').select('badge_code, context, earned_at').eq('profile_id', profile.id).order('earned_at', { ascending: false }),
  ]);
  const games = (rows ?? []) as ProfileBattle[];
  const live = (liveRows ?? []) as BattleWithPlayers[];
  const isMe = auth.user?.id === profile.id;

  const n = profile.battles_count;
  const winPct = profile.win_rate != null ? Math.round(profile.win_rate * 100) : null;
  const forfeits = games.filter((g) => g.forfeited_by === profile.id).length;

  let streak = '—';
  if (games.length) {
    const kind = games[games.length - 1].outcome;
    let k = 0;
    for (let i = games.length - 1; i >= 0 && games[i].outcome === kind; i--) k++;
    const word = kind === 'W' ? (k === 1 ? 'win' : 'wins') : kind === 'L' ? (k === 1 ? 'loss' : 'losses') : k === 1 ? 'draw' : 'draws';
    streak = `${k} ${word}`;
  }

  const opp = new Map<string, { username: string; n: number; W: number; L: number; D: number; last: ProfileBattle }>();
  for (const g of games) {
    const o = opp.get(g.opponent_id) ?? { username: g.opponent_username, n: 0, W: 0, L: 0, D: 0, last: g };
    o.n++; o[g.outcome]++; o.last = g;
    opp.set(g.opponent_id, o);
  }
  const opponents = [...opp.values()].sort((a, b) => b.n - a.n || +new Date(b.last.finished_at) - +new Date(a.last.finished_at));
  const top = opponents[0];

  const tiles: [string, React.ReactNode, string | null, boolean][] = [
    ['Rating', profile.elo_rating, n < PROVISIONAL_BATTLES ? 'Provisional until 20 battles' : `Rank ${profile.global_rank} of ${total ?? '—'}`, true],
    ['Peak rating', profile.peak_elo, null, true],
    ['Battles', n, null, true],
    ['Won, lost, drawn', `${profile.wins}–${profile.losses}–${profile.draws}`, null, true],
    ['Win rate', winPct != null ? `${winPct}%` : '—', null, true],
    ['Current streak', streak, null, false],
    ['Forfeits', forfeits, 'Missed deadlines', true],
    ['Most faced', top ? `@${top.username}` : '—', top ? `${top.n} ${top.n === 1 ? 'battle' : 'battles'}, ${top.W}–${top.L}–${top.D}` : null, false],
  ];

  const history = [...games].reverse();
  const shown = all ? history : history.slice(0, 15);
  const socials = Object.entries(profile.social_links ?? {}).filter(([k, v]) => SOCIALS[k] && /^https:\/\//.test(v));

  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-center gap-5">
        <Avatar username={profile.username} url={profile.avatar_url} size="lg" />
        <div className="grid min-w-0 flex-1 gap-2">
          <h1 className="handle text-[clamp(2rem,6vw,4rem)] leading-none break-all">@{profile.username}</h1>
          {profile.featured_badge && <p><BadgeChip code={profile.featured_badge} /></p>}
          <p className="flex flex-wrap gap-x-5 gap-y-1 text-muted">
            {profile.full_name && <span>{profile.full_name}</span>}
            {profile.country && <span><span aria-hidden="true">{flagEmoji(profile.country)} </span>{countryName(profile.country)}</span>}
            <span>Joined {formatMonth(profile.created_at)}</span>
          </p>
          {profile.bio && <p className="max-w-[62ch]">{profile.bio}</p>}
          {socials.length > 0 && (
            <p className="flex flex-wrap gap-4 text-sm">
              {socials.map(([k, v]) => <a key={k} href={v} rel="noopener noreferrer nofollow" target="_blank" className="underline underline-offset-4">{SOCIALS[k]}</a>)}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          {isMe ? (
            <Link href="/settings" className="rounded-full border border-line px-5 py-2.5">Edit profile</Link>
          ) : (
            <Link href={`/battles/new?opponent=${profile.username}`} className="rounded-full bg-ink px-5 py-2.5 text-paper">Challenge</Link>
          )}
        </div>
      </header>

      <dl className="grid grid-cols-2 border-t-2 border-ink md:grid-cols-4">
        {tiles.map(([label, value, note, numeric]) => (
          <div key={label} className="min-w-0 border-b border-line py-4 pr-4">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className={numeric ? 'num mt-0.5 text-3xl leading-tight' : 'mt-1.5 text-lg font-semibold break-words'}>{value}</dd>
            {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
          </div>
        ))}
      </dl>

      <BadgeShelf earned={(badgeRows ?? []) as EarnedBadge[]} isMe={isMe} />

      {live.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-xl font-bold [font-stretch:112%]">In progress</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {live.map((b) => <li key={b.id} className="grid"><BattleRow b={b} viewerId={auth.user?.id} /></li>)}
          </ul>
        </section>
      )}

      {games.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-8 text-muted">
          No finished battles yet.{' '}
          {isMe ? <Link href="/battles/new" className="text-ink underline underline-offset-4">Start your first battle</Link> : null}
        </div>
      ) : (
        <>
          <section className="grid gap-3">
            <h2 className="text-xl font-bold [font-stretch:112%]">Rating over time</h2>
            <RatingChart games={games} peak={profile.peak_elo} current={profile.elo_rating} />
            <p className="text-sm text-muted">The dashed line marks the peak rating.</p>
          </section>

          <section className="grid gap-3">
            <h2 className="text-xl font-bold [font-stretch:112%]">Opponents ({opponents.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-[0.925rem]">
                <thead>
                  <tr className="border-b-2 border-ink text-left text-xs text-muted">
                    <th scope="col" className="py-2 pr-3 font-semibold">Opponent</th>
                    {['Battles', 'Won', 'Lost', 'Drawn'].map((h) => <th key={h} scope="col" className="py-2 pr-3 text-right font-semibold">{h}</th>)}
                    <th scope="col" className="py-2 font-semibold">Last met</th>
                  </tr>
                </thead>
                <tbody>
                  {opponents.map((o) => (
                    <tr key={o.username} className="border-b border-line">
                      <td className="py-2.5 pr-3"><Link href={`/beatboxers/${o.username}`} className="underline-offset-4 hover:underline">@{o.username}</Link></td>
                      <td className="num py-2.5 pr-3 text-right">{o.n}</td>
                      <td className="num py-2.5 pr-3 text-right text-win">{o.W}</td>
                      <td className="num py-2.5 pr-3 text-right text-loss">{o.L}</td>
                      <td className="num py-2.5 pr-3 text-right">{o.D}</td>
                      <td className="py-2.5 whitespace-nowrap">{resultText(o.last)}, {formatAgo(o.last.finished_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-3">
            <h2 className="text-xl font-bold [font-stretch:112%]">Battle history</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-[0.925rem]">
                <thead>
                  <tr className="border-b-2 border-ink text-left text-xs text-muted">
                    <th scope="col" className="py-2 pr-3 font-semibold">Date</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Opponent</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Result</th>
                    <th scope="col" className="py-2 pr-3 text-right font-semibold">Votes</th>
                    <th scope="col" className="py-2 text-right font-semibold">Rating change</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((g) => (
                    <tr key={g.battle_id} className="border-b border-line">
                      <td className="py-2.5 pr-3 whitespace-nowrap">
                        <Link href={`/battles/${g.battle_id}`} className="underline-offset-4 hover:underline">{formatDate(g.finished_at)}</Link>
                        {g.mode !== 'async' && <span className="ml-2 rounded bg-sub px-1 text-xs font-bold text-paper">{g.mode === 'stage' ? 'Stage' : 'Live'}</span>}
                      </td>
                      <td className="py-2.5 pr-3"><Link href={`/beatboxers/${g.opponent_username}`} className="underline-offset-4 hover:underline">@{g.opponent_username}</Link></td>
                      <td className={`py-2.5 pr-3 ${g.outcome === 'W' ? 'text-win' : g.outcome === 'L' ? 'text-loss' : ''}`}>{resultText(g)}</td>
                      <td className="num py-2.5 pr-3 text-right">{g.result === 'forfeit' ? '—' : `${g.my_votes}–${g.their_votes}`}</td>
                      <td className="num py-2.5 text-right whitespace-nowrap">
                        {g.delta != null && <span className={g.delta >= 0 ? 'text-win' : 'text-loss'}>{signed(g.delta)}</span>}
                        {g.elo_after != null && <span className="text-muted"> to {g.elo_after}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!all && history.length > shown.length && (
              <Link href={`/beatboxers/${profile.username}?all=1`} className="justify-self-start rounded-full border border-line px-5 py-2.5">
                Show all {history.length} battles
              </Link>
            )}
          </section>
        </>
      )}
      {!isMe && (
        <div className="border-t border-line pt-4">
          <ReportButton profileId={profile.id} signedIn={!!auth.user} label="Report this profile" />
        </div>
      )}
    </main>
  );
}
