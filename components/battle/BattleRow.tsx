import Link from 'next/link';
import Countdown from '@/components/Countdown';
import type { BattleWithPlayers } from '@/lib/types';
import { getT } from '@/lib/i18n/server';

/** Compact battle summary used in lists. Server-renderable; only countdowns hydrate. */
export default async function BattleRow({ b, viewerId }: { b: BattleWithPlayers; viewerId?: string | null }) {
  const { t: all } = await getT();
  const t = all.battleRow;
  const opp = b.opponent ? `@${b.opponent.username}` : t.openSlot;
  const turnName = b.current_turn_user_id === b.challenger_id ? b.challenger.username : b.opponent?.username;
  const winner = b.winner_id === b.challenger_id ? b.challenger.username : b.opponent?.username;

  let status: React.ReactNode;
  if (b.status === 'open') status = t.open;
  else if (b.status === 'pending') status = t.waitingAccept;
  else if (b.status === 'active' && b.mode !== 'async' && b.starts_at) status = <>{b.mode === 'stage' ? t.stageIn : t.liveIn} <Countdown to={b.starts_at} /></>;
  else if (b.status === 'active') status = b.current_turn_user_id === viewerId ? t.yourTurn : t.turnOf(turnName ?? '');
  else if (b.status === 'live') status = t.liveNow;
  else if (b.status === 'voting' && b.voting_ends_at) status = <>{t.votingCloses} <Countdown to={b.voting_ends_at} /></>;
  else if (b.status === 'finished')
    status = b.result === 'no_contest' ? t.noContest : b.result === 'draw' ? t.draw : b.result === 'forfeit' ? t.wonForfeit(winner ?? '') : t.won(winner ?? '');
  else status = t.expired;

  const hot = b.status === 'live' || b.status === 'voting' || b.status === 'active';

  return (
    <Link
      href={`/battles/${b.id}`}
      className="grid gap-1 rounded-2xl border border-line bg-surface px-4 py-3.5 hover:border-ink"
    >
      <span className="font-bold [font-stretch:112%] break-words">@{b.challenger.username} vs {opp}</span>
      <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
        {b.mode !== 'async' && <span className="rounded bg-sub px-1.5 text-xs font-bold text-paper">{b.mode === 'stage' ? t.chipStage : t.chipLive}</span>}
        <span className={`size-2 rounded-full ${hot ? 'bg-sub' : b.status === 'finished' ? 'bg-win' : 'bg-line'}`} aria-hidden="true" />
        <span className="num">{status}</span>
      </span>
    </Link>
  );
}
