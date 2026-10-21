'use client';

import { useI18n } from '@/components/i18n/I18nProvider';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { eventRpc } from '@/lib/supabase/events';
import type { MatchRow } from './Bracket';

export interface SmokeRow { profile_id: string; points: number; queue_pos: number | null }

interface Props {
  eventId: string;
  isHost: boolean;
  live: boolean;
  target: number;
  smoke: SmokeRow[];
  matches: MatchRow[];
  names: Record<string, string>;
  currentBattleId: string | null;
}

/** 7 to Smoke: scoreboard, who's on stage, the line, and every battle so far. */
export default function SmokeBoard({ eventId, isHost, live, target, smoke, matches, names, currentBattleId }: Props) {
  const t = useI18n().t.ev;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await eventRpc(supabase, fn, { p_event: eventId, ...args });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failed);
    } finally {
      setBusy(false);
    }
  }

  const history = matches.filter((m) => m.phase === 'smoke').sort((a, b) => b.round - a.round);
  const current = history.find((m) => !m.winner_id) ?? null;
  const done = history.filter((m) => m.winner_id);
  const board = [...smoke].sort((a, b) => b.points - a.points);
  const line = smoke.filter((s) => s.queue_pos !== null).sort((a, b) => (a.queue_pos ?? 0) - (b.queue_pos ?? 0));
  const onStage = current && currentBattleId && current.battle_id === currentBattleId;

  return (
    <section className="grid gap-8" aria-label="7 to Smoke">
      {error && <p role="alert" className="text-loss">{error}</p>}

      {current && (
        <div className="grid gap-3 rounded-2xl border border-line bg-surface p-5">
          <p className="text-sm text-muted">{t.battleN(current.round)}</p>
          <p className="handle text-[clamp(1.6rem,5vw,2.6rem)] leading-tight">
            @{names[current.a_id!]} <span className="text-muted">vs</span> @{names[current.b_id!]}
          </p>
          <p className="text-sm text-muted">{t.holdsStage(names[current.a_id!])}</p>
          {isHost && (
            <div className="flex flex-wrap gap-2">
              {onStage ? <span className="font-semibold text-sub">{t.onStageNow}</span> : live && (
                <button disabled={busy} onClick={() => act('host_open_match', { p_match: current.id })} className="rounded-full bg-ink px-5 py-2.5 text-paper disabled:opacity-50">{t.putOnStage}</button>
              )}
              {[current.a_id!, current.b_id!].map((id) => (
                <button key={id} disabled={busy} onClick={() => act('host_award_match', { p_match: current.id, p_winner: id })} className="rounded-full border border-line px-4 py-2 text-sm">
                  {t.noShowPoint(names[id])}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <div className="grid content-start gap-3">
          <h3 className="text-xl font-bold [font-stretch:112%]">{t.scoreboard}</h3>
          <ol className="grid gap-2">
            {board.map((s) => (
              <li key={s.profile_id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                <span className="truncate">
                  @{names[s.profile_id]}
                  {s.queue_pos === null && <span className="ml-2 rounded-full bg-sub px-2 py-0.5 text-xs text-paper">{t.onStage}</span>}
                </span>
                <span className="num text-xl">{s.points}<span className="text-sm text-muted">/{target}</span></span>
                <span className="col-span-2 h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
                  <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.min(100, (s.points / target) * 100)}%` }} />
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="grid content-start gap-3">
          <h3 className="text-xl font-bold [font-stretch:112%]">{t.theLine}</h3>
          {line.length ? (
            <ol className="grid border-t-2 border-ink">
              {line.map((s, i) => (
                <li key={s.profile_id} className="grid grid-cols-[1.5rem_1fr] gap-3 border-b border-line py-2">
                  <span className="num text-muted">{i + 1}</span><span>@{names[s.profile_id]}</span>
                </li>
              ))}
            </ol>
          ) : <p className="text-muted">{t.nobodyWaiting}</p>}
        </div>
      </div>

      {done.length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-xl font-bold [font-stretch:112%]">{t.battlesSoFar}</h3>
          <ol className="grid border-t-2 border-ink text-sm">
            {done.map((m) => (
              <li key={m.id} className="grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-3 border-b border-line py-2">
                <span className="num text-muted">{m.round}</span>
                <span>
                  <strong>@{names[m.winner_id!]}</strong> {t.beat} @{names[m.winner_id === m.a_id ? m.b_id! : m.a_id!]}
                  {m.walkover && <span className="text-muted"> ({t.noShow})</span>}
                </span>
                {m.battle_id && !m.walkover ? <Link href={`/battles/${m.battle_id}`} className="text-muted underline underline-offset-4">{t.replay}</Link> : <span />}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
