import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import BattleRow from '@/components/battle/BattleRow';
import RatingChart from '@/components/profile/RatingChart';
import ReportButton from '@/components/moderation/ReportButton';
import BadgeChip from '@/components/badges/BadgeChip';
import BadgeShelf, { type EarnedBadge } from '@/components/badges/BadgeShelf';
import { Avatar, FormStrip } from '@/components/directory/BeatboxerCard';
import { PROVISIONAL_BATTLES } from '@/lib/constants';
import { countryName, flagEmoji, formatAgo, formatDate, formatMonth, signed } from '@/lib/format';
import { getT } from '@/lib/i18n/server';
import { LOCALE_TAG } from '@/lib/i18n/config';
import type { Dict } from '@/lib/i18n';
import type { BattleWithPlayers, DirectoryEntry, ProfileBattle } from '@/lib/types';

const PLAYER = 'id, username, full_name, avatar_url, country, elo_rating, featured_badge';
const resultText = (g: ProfileBattle, t: Dict['profile']) => {
  const o = { W: t.won, L: t.lost, D: t.drew }[g.outcome];
  return g.result === 'forfeit' ? t.byForfeit(o) : g.outcome === 'D' ? t.draw : t.byDecision(o);
};

const SOCIALS: Record<string, string> = { instagram: 'Instagram', youtube: 'YouTube', tiktok: 'TikTok', x: 'X' };

export default async function ProfilePage({ params, searchParams }: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ all?: string }>;
}) {
  const { locale, t: tr } = await getT();
  const t = tr.profile;
  const tag = LOCALE_TAG[locale];
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
    streak = t.streak(k, kind);
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
    [t.peak, profile.peak_elo, null, true],
    [t.battles, n, null, true],
    [t.wld, `${profile.wins}–${profile.losses}–${profile.draws}`, null, true],
    [t.winRate, winPct != null ? `${winPct}%` : '—', null, true],
    [t.currentStreak, streak, null, false],
    [t.forfeits, forfeits, t.missed, true],
    [t.mostFaced, top ? `@${top.username}` : '—', top ? t.facedSummary(top.n, `${top.W}–${top.L}–${top.D}`) : null, false],
  ];

  const history = [...games].reverse();
  const ring: 'gold' | 'elite' | 'muted' = n === 0 ? 'muted' : profile.global_rank === 1 ? 'gold' : profile.global_rank <= 10 ? 'elite' : 'muted';
  const shown = all ? history : history.slice(0, 15);
  const socials = Object.entries(profile.social_links ?? {}).filter(([k, v]) => SOCIALS[k] && /^https:\/\//.test(v));

  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6">
      <header className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-surface-2 via-surface to-paper p-6 sm:p-8">
        <span className={`pointer-events-none absolute -top-32 -right-24 size-80 rounded-full blur-3xl ${ring === 'gold' ? 'bg-gold/15' : 'bg-sub/12'}`} aria-hidden="true" />
        <div className="relative grid gap-6 md:grid-cols-[auto_1fr_auto] md:items-center">
          <Avatar username={profile.username} url={profile.avatar_url} size="xl" ring={ring} />
          <div className="grid min-w-0 gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {n > 0 && (
                <span className={`rounded-full border px-2.5 py-0.5 font-mono text-xs tracking-widest uppercase ${ring === 'gold' ? 'border-gold/50 bg-gold/10 text-gold' : ring === 'elite' ? 'border-sub/50 bg-sub/10 text-sub' : 'border-line text-muted'}`}>
                  #{profile.global_rank}{profile.global_rank <= 10 ? ` · ${tr.board.elite}` : ''}
                </span>
              )}
              {profile.featured_badge && <BadgeChip code={profile.featured_badge} />}
            </div>
            <h1 className="handle text-[clamp(2.2rem,6vw,4.2rem)] leading-none break-all">{profile.username}</h1>
            <p className="flex flex-wrap gap-x-5 gap-y-1 text-muted">
              {profile.full_name && <span>{profile.full_name}</span>}
              {profile.country && <span><span aria-hidden="true">{flagEmoji(profile.country)} </span>{countryName(profile.country, locale)}</span>}
              <span>{t.joined(formatMonth(profile.created_at, tag))}</span>
            </p>
            {profile.bio && <p className="max-w-[62ch]">{profile.bio}</p>}
            {socials.length > 0 && (
              <p className="flex flex-wrap gap-2 text-sm">
                {socials.map(([k, v]) => <a key={k} href={v} rel="noopener noreferrer nofollow" target="_blank" className="rounded-full border border-line px-3 py-1 hover:border-muted">{SOCIALS[k]}</a>)}
              </p>
            )}
          </div>
          <div className="grid gap-3 md:justify-items-end md:text-right">
            <div className="grid md:justify-items-end">
              <span className="label">{t.rating}</span>
              <span className={`num text-6xl leading-none font-bold ${ring === 'gold' ? 'text-gold' : ''}`}>{profile.elo_rating}</span>
              <span className="font-mono text-xs text-muted">
                {n < PROVISIONAL_BATTLES ? t.provisional : profile.peak_elo > profile.elo_rating ? tr.board.peak(profile.peak_elo) : t.rankOf(profile.global_rank, String(total ?? '—'))}
              </span>
            </div>
            {games.length > 0 && <FormStrip games={history.slice(0, 10)} />}
            {isMe ? (
              <Link href="/settings" className="rounded-full border border-line px-5 py-2.5 text-center">{t.edit}</Link>
            ) : (
              <Link href={`/battles/new?opponent=${profile.username}`} className="rounded-full bg-ink px-6 py-2.5 text-center text-paper">{t.challenge}</Link>
            )}
          </div>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map(([label, value, note, numeric]) => (
          <div key={label} className="grid min-w-0 content-start gap-1 rounded-2xl border border-line bg-gradient-to-b from-surface-2 to-surface p-4">
            <dt className="label">{label}</dt>
            <dd className={numeric ? 'num text-3xl leading-tight font-bold' : 'text-lg font-semibold break-words'}>{value}</dd>
            {note && <p className="text-xs text-muted">{note}</p>}
          </div>
        ))}
      </dl>

      <BadgeShelf earned={(badgeRows ?? []) as EarnedBadge[]} isMe={isMe} />

      {live.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-xl font-bold [font-stretch:112%]">{t.inProgress}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {live.map((b) => <li key={b.id} className="grid"><BattleRow b={b} viewerId={auth.user?.id} /></li>)}
          </ul>
        </section>
      )}

      {games.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-8 text-muted">
          {t.noBattles}{' '}
          {isMe ? <Link href="/battles/new" className="text-ink underline underline-offset-4">{t.startFirst}</Link> : null}
        </div>
      ) : (
        <>
          <section className="grid gap-3">
            <h2 className="text-xl font-bold [font-stretch:112%]">{t.ratingOverTime}</h2>
            <RatingChart games={games} peak={profile.peak_elo} current={profile.elo_rating} />
            <p className="text-sm text-muted">{t.peakLine}</p>
          </section>

          <section className="grid gap-3">
            <h2 className="text-xl font-bold [font-stretch:112%]">{t.opponents} ({opponents.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-[0.925rem]">
                <thead>
                  <tr className="border-b-2 border-ink text-left text-xs text-muted">
                    <th scope="col" className="py-2 pr-3 font-semibold">{t.opponent}</th>
                    {[t.battles, t.colWon, t.colLost, t.colDrawn].map((h) => <th key={h} scope="col" className="py-2 pr-3 text-right font-semibold">{h}</th>)}
                    <th scope="col" className="py-2 font-semibold">{t.lastMet}</th>
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
                      <td className="py-2.5 whitespace-nowrap">{resultText(o.last, t)}, {formatAgo(o.last.finished_at, Date.now(), tr.time)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-3">
            <h2 className="text-xl font-bold [font-stretch:112%]">{t.history}</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-[0.925rem]">
                <thead>
                  <tr className="border-b-2 border-ink text-left text-xs text-muted">
                    <th scope="col" className="py-2 pr-3 font-semibold">{t.date}</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">{t.opponent}</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">{t.result}</th>
                    <th scope="col" className="py-2 pr-3 text-right font-semibold">{t.votes}</th>
                    <th scope="col" className="py-2 text-right font-semibold">{t.ratingChange}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((g) => (
                    <tr key={g.battle_id} className="border-b border-line">
                      <td className="py-2.5 pr-3 whitespace-nowrap">
                        <Link href={`/battles/${g.battle_id}`} className="underline-offset-4 hover:underline">{formatDate(g.finished_at, tag)}</Link>
                        {g.mode !== 'async' && <span className="ml-2 rounded bg-sub px-1 text-xs font-bold text-paper">{g.mode === 'stage' ? t.chipStage : t.chipLive}</span>}
                      </td>
                      <td className="py-2.5 pr-3"><Link href={`/beatboxers/${g.opponent_username}`} className="underline-offset-4 hover:underline">@{g.opponent_username}</Link></td>
                      <td className={`py-2.5 pr-3 ${g.outcome === 'W' ? 'text-win' : g.outcome === 'L' ? 'text-loss' : ''}`}>{resultText(g, t)}</td>
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
          <ReportButton profileId={profile.id} signedIn={!!auth.user} label={tr.report.profile} />
        </div>
      )}
    </main>
  );
}
