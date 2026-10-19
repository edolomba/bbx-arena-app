import type { AppNotification } from '@/lib/types';

const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

/** One plain sentence per notification, from the reader's point of view. */
export function notificationText(n: AppNotification): string {
  const who = n.actor ? `@${n.actor.username}` : 'Someone';
  const d = n.data ?? {};
  switch (n.kind) {
    case 'challenge_received':
      return d.mode === 'live' ? `${who} challenged you to a live battle on ${when(d.starts_at)}` : `${who} challenged you to a battle`;
    case 'challenge_accepted':
      return d.mode === 'live' ? `${who} accepted your live battle. Lock in your round before ${when(d.starts_at)}` : `${who} accepted your challenge. Your turn to open`;
    case 'challenge_declined':
      return `${who} declined your challenge`;
    case 'your_turn':
      return `Your turn against ${who}`;
    case 'live_soon':
      return `Your live battle against ${who} starts in 15 minutes`;
    case 'voting_open':
      return `Voting is open on your battle with ${who}`;
    case 'battle_result': {
      if (d.outcome === 'N') return `No votes on your battle with ${who}, so it ended without a result`;
      if (d.outcome === 'D') return `Your battle with ${who} ended in a draw`;
      const delta = typeof d.elo_delta === 'number' ? ` (${d.elo_delta >= 0 ? '+' : '−'}${Math.abs(d.elo_delta)} rating)` : '';
      if (d.outcome === 'W') return d.result === 'forfeit' ? `You won against ${who} by forfeit${delta}` : `You beat ${who}${delta}`;
      return d.forfeited_by_me ? `You lost to ${who} by forfeit${delta}` : `${who} won your battle${delta}`;
    }
  }
}
