import type { AppNotification } from '@/lib/types';

const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

/** One plain sentence per notification, from the reader's point of view. */
export function notificationText(n: AppNotification): string {
  const who = n.actor ? `@${n.actor.username}` : 'Someone';
  const d = n.data ?? {};
  switch (n.kind) {
    case 'challenge_received':
      if (d.mode === 'stage') return `${who} challenged you to a stage battle, real time, on ${when(d.starts_at)}`;
      return d.mode === 'live' ? `${who} challenged you to a live battle on ${when(d.starts_at)}` : `${who} challenged you to a battle`;
    case 'challenge_accepted':
      if (d.mode === 'stage') return `${who} accepted your stage battle. Be in the room before ${when(d.starts_at)}`;
      return d.mode === 'live' ? `${who} accepted your live battle. Lock in your round before ${when(d.starts_at)}` : `${who} accepted your challenge. Your turn to open`;
    case 'challenge_declined':
      return `${who} declined your challenge`;
    case 'your_turn':
      return `Your turn against ${who}`;
    case 'live_soon':
      return `Your battle against ${who} starts in 15 minutes. Join early with headphones`;
    case 'voting_open':
      return `Voting is open on your battle with ${who}`;
    case 'judge_invited':
      return `${who} invited you to judge a stage battle on ${when(d.starts_at)}`;
    case 'host_invited':
      return `${who} asked you to host a stage battle on ${when(d.starts_at)}`;
    case 'event_judge_invited':
      return `${who} invited you to judge “${d.title ?? 'an event'}”`;
    case 'event_update': {
      const t = `“${d.title ?? 'Your event'}”`;
      if (d.what === 'eliminations_started') return `${t}: the eliminations are live now`;
      if (d.what === 'paused') return d.next_session_at ? `${t} paused. Next session ${when(d.next_session_at)}` : `${t} paused`;
      if (d.what === 'resumed') return `${t} is live again`;
      if (d.what === 'judging') return `${t}: the judges are ranking the showcases`;
      return `${t}: the official classification is out`;
    }
    case 'battle_result': {
      if (d.outcome === 'N') return `No votes on your battle with ${who}, so it ended without a result`;
      if (d.outcome === 'D') return `Your battle with ${who} ended in a draw`;
      const delta = typeof d.elo_delta === 'number' ? ` (${d.elo_delta >= 0 ? '+' : '−'}${Math.abs(d.elo_delta)} rating)` : '';
      if (d.outcome === 'W') return d.result === 'forfeit' ? `You won against ${who} by forfeit${delta}` : `You beat ${who}${delta}`;
      return d.forfeited_by_me ? `You lost to ${who} by forfeit${delta}` : `${who} won your battle${delta}`;
    }
  }
}

/** Where tapping a notification goes. */
export const notificationHref = (n: { battle_id: string | null; event_id?: string | null }) =>
  n.event_id ? `/events/${n.event_id}` : n.battle_id ? `/battles/${n.battle_id}` : '/notifications';
