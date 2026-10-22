import type { AppNotification } from '@/lib/types';
import { getDict, type Dict } from '@/lib/i18n';
import { LOCALE_TAG, type Locale } from '@/lib/i18n/config';

/** One plain sentence per notification, from the reader's point of view, in their language. */
export function notificationText(n: AppNotification, locale: Locale = 'en', dict?: Dict): string {
  const t = (dict ?? getDict(locale)).notifications;
  const when = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString(LOCALE_TAG[locale], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const who = n.actor ? `@${n.actor.username}` : t.someone;
  const d = n.data ?? {};
  switch (n.kind) {
    case 'challenge_received':
      if (d.mode === 'stage') return t.challengeStage(who, when(d.starts_at));
      return d.mode === 'live' ? t.challengeLive(who, when(d.starts_at)) : t.challenge(who);
    case 'challenge_accepted':
      if (d.mode === 'stage') return t.acceptedStage(who, when(d.starts_at));
      return d.mode === 'live' ? t.acceptedLive(who, when(d.starts_at)) : d.their_turn ? t.acceptedReady(who) : t.accepted(who);
    case 'challenge_declined':
      return t.declined(who);
    case 'your_turn':
      return t.yourTurn(who);
    case 'live_soon':
      return t.liveSoon(who);
    case 'voting_open':
      return t.votingOpen(who);
    case 'judge_invited':
      return t.judgeInvited(who, when(d.starts_at));
    case 'host_invited':
      return t.hostInvited(who, when(d.starts_at));
    case 'badge_earned': {
      const name = d.name ?? t.aBadge;
      if (d.event) return t.badgeAt(name, d.event);
      if (d.season) return t.badgeIn(name, d.season);
      return t.badge(name);
    }
    case 'event_judge_invited':
      return t.eventJudge(who, d.title ?? t.anEvent);
    case 'event_update': {
      const title = d.title ?? t.yourEvent;
      if (d.what === 'eliminations_started') return t.eventStarted(title);
      if (d.what === 'paused') return d.next_session_at ? t.eventPausedNext(title, when(d.next_session_at)) : t.eventPaused(title);
      if (d.what === 'resumed') return t.eventResumed(title);
      if (d.what === 'judging') return t.eventJudging(title);
      if ((d.what as string) === 'finished') return t.eventFinished(title);
      return t.eventPublished(title);
    }
    case 'battle_result': {
      if (d.outcome === 'N') return t.resultNoContest(who);
      if (d.outcome === 'D') return t.resultDraw(who);
      const delta = typeof d.elo_delta === 'number' ? t.rating(`${d.elo_delta >= 0 ? '+' : '−'}${Math.abs(d.elo_delta)}`) : '';
      if (d.outcome === 'W') return d.result === 'forfeit' ? t.resultWonForfeit(who, delta) : t.resultWon(who, delta);
      return d.forfeited_by_me ? t.resultLostForfeit(who, delta) : t.resultLost(who, delta);
    }
  }
}

/** Where tapping a notification goes. */
export const notificationHref = (n: { kind?: string; battle_id: string | null; event_id?: string | null; data?: { username?: string } }) =>
  n.kind === 'badge_earned' && n.data?.username ? `/beatboxers/${n.data.username}#badges`
    : n.event_id ? `/events/${n.event_id}` : n.battle_id ? `/battles/${n.battle_id}` : '/notifications';
