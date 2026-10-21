import Link from 'next/link';
import { PROVISIONAL_BATTLES } from '@/lib/constants';
import BadgeChip from '@/components/badges/BadgeChip';
import { countryName, flagEmoji, formatAgo } from '@/lib/format';
import type { DirectoryEntry, ProfileBattle } from '@/lib/types';

const OUTCOME = { W: 'won', L: 'lost', D: 'drew' } as const;

export function FormStrip({ games }: { games: ProfileBattle[] }) {
  return (
    <ol className="flex gap-1" aria-label={`Last ${games.length} results, newest first: ${games.map((g) => OUTCOME[g.outcome]).join(', ')}`}>
      {games.map((g) => (
        <li key={g.battle_id} aria-hidden="true" title={`${OUTCOME[g.outcome]} against @${g.opponent_username}`}
          className={`grid size-6 place-items-center rounded-md text-xs font-bold text-paper ${
            g.outcome === 'W' ? 'bg-win' : g.outcome === 'L' ? 'bg-loss' : 'bg-muted'}`}>
          {g.outcome}
        </li>
      ))}
    </ol>
  );
}

export function Avatar({ username, url, size = 'md' }: { username: string; url: string | null; size?: 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'size-20 text-3xl' : 'size-13 text-xl';
  // eslint-disable-next-line @next/next/no-img-element
  if (url) return <img src={url} alt="" className={`${cls} shrink-0 rounded-full object-cover`} />;
  return (
    <span aria-hidden="true" className={`handle grid shrink-0 place-items-center rounded-full bg-ink text-paper ${cls}`}>
      {username.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Directory card: rating, record, recent form and the last battle. */
export default function BeatboxerCard({ entry, recent }: { entry: DirectoryEntry; recent: ProfileBattle[] }) {
  const provisional = entry.battles_count < PROVISIONAL_BATTLES;
  const winPct = entry.win_rate != null ? Math.round(entry.win_rate * 100) : null;
  const last = recent[0];
  const verb = last ? (last.outcome === 'W' ? 'Beat' : last.outcome === 'L' ? 'Lost to' : 'Drew with') : '';
  const score = last ? (last.result === 'forfeit' ? 'by forfeit' : `${last.my_votes}–${last.their_votes}`) : '';

  return (
    <article className="grid h-full content-start gap-5 rounded-2xl border border-line bg-surface p-5">
      <header className="flex items-start gap-4">
        <Avatar username={entry.username} url={entry.avatar_url} />
        <div className="min-w-0 flex-1">
          <h3 className="handle truncate text-xl leading-tight">
            <Link href={`/beatboxers/${entry.username}`} className="underline-offset-4 hover:underline">@{entry.username}</Link>
          </h3>
          {entry.featured_badge && <p className="mt-0.5"><BadgeChip code={entry.featured_badge} compact /></p>}
          {entry.full_name && <p className="truncate text-muted">{entry.full_name}</p>}
          {entry.country && (
            <p className="text-sm text-muted"><span aria-hidden="true">{flagEmoji(entry.country)} </span>{countryName(entry.country)}</p>
          )}
        </div>
        <div className="text-right">
          <p className="num text-3xl leading-none">{entry.elo_rating}</p>
          <p className="mt-1 text-sm text-muted">{provisional ? 'Provisional' : `Rank ${entry.global_rank}`}</p>
        </div>
      </header>

      <div className="grid gap-2">
        <p className="num flex gap-4 text-sm">
          <span><span className="text-win">{entry.wins}</span> won</span>
          <span><span className="text-loss">{entry.losses}</span> lost</span>
          {entry.draws > 0 && <span>{entry.draws} drawn</span>}
          {winPct != null && <span className="ml-auto text-muted">{winPct}% win rate</span>}
        </p>
        {winPct != null && (
          <div className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
            <div className="h-full bg-win" style={{ width: `${winPct}%` }} />
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted">Recent form</span>
          <FormStrip games={[...recent].slice(0, 5)} />
        </div>
      )}
      {last ? (
        <p className="text-sm"><span className="text-muted">Last battle: </span>{verb} @{last.opponent_username}, {score}, {formatAgo(last.finished_at)}</p>
      ) : (
        <p className="text-sm text-muted">No finished battles yet.</p>
      )}

      <Link href={`/beatboxers/${entry.username}`} className="justify-self-start rounded-full border border-line px-4 py-2 text-sm hover:border-ink">
        See stats and battles
      </Link>
    </article>
  );
}
