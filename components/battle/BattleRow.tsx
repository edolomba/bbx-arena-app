import Link from 'next/link';
import Countdown from '@/components/Countdown';
import type { BattleWithPlayers } from '@/lib/types';

/** Compact battle summary used in lists. Server-renderable; only countdowns hydrate. */
export default function BattleRow({ b, viewerId }: { b: BattleWithPlayers; viewerId?: string | null }) {
  const opp = b.opponent ? `@${b.opponent.username}` : 'Open slot';
  const turnName = b.current_turn_user_id === b.challenger_id ? b.challenger.username : b.opponent?.username;
  const winner = b.winner_id === b.challenger_id ? b.challenger.username : b.opponent?.username;

  let status: React.ReactNode;
  if (b.status === 'open') status = 'Open challenge, anyone can take it';
  else if (b.status === 'pending') status = 'Waiting for the opponent to accept';
  else if (b.status === 'active' && b.mode !== 'async' && b.starts_at) status = <>{b.mode === 'stage' ? 'Stage' : 'Live'} in <Countdown to={b.starts_at} /></>;
  else if (b.status === 'active') status = b.current_turn_user_id === viewerId ? 'Your turn' : `@${turnName}’s turn`;
  else if (b.status === 'live') status = 'Live now';
  else if (b.status === 'voting' && b.voting_ends_at) status = <>Voting closes in <Countdown to={b.voting_ends_at} /></>;
  else if (b.status === 'finished')
    status = b.result === 'no_contest' ? 'No contest' : b.result === 'draw' ? 'Draw' : `@${winner} won${b.result === 'forfeit' ? ' by forfeit' : ''}`;
  else status = 'Expired';

  const hot = b.status === 'live' || b.status === 'voting' || b.status === 'active';

  return (
    <Link
      href={`/battles/${b.id}`}
      className="grid gap-1 rounded-2xl border border-line bg-surface px-4 py-3.5 hover:border-ink"
    >
      <span className="font-bold [font-stretch:112%] break-words">@{b.challenger.username} vs {opp}</span>
      <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
        {b.mode !== 'async' && <span className="rounded bg-sub px-1.5 text-xs font-bold text-paper">{b.mode === 'stage' ? 'Stage' : 'Live'}</span>}
        <span className={`size-2 rounded-full ${hot ? 'bg-sub' : b.status === 'finished' ? 'bg-win' : 'bg-line'}`} aria-hidden="true" />
        <span className="num">{status}</span>
      </span>
    </Link>
  );
}
