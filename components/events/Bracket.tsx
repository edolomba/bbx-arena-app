'use client';

import { useI18n } from '@/components/i18n/I18nProvider';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { eventRpc } from '@/lib/supabase/events';

export interface MatchRow {
  id: string;
  phase: 'swiss' | 'knockout' | 'small_final' | 'smoke';
  round: number;
  slot: number;
  a_id: string | null;
  b_id: string | null;
  battle_id: string | null;
  winner_id: string | null;
  walkover: boolean;
}

export interface SwissRow { profile_id: string; wins: number; buchholz: number; pos: number }

interface Props {
  eventId: string;
  isHost: boolean;
  live: boolean;
  mainFormat: 'knockout' | 'swiss';
  matches: MatchRow[];
  swiss: SwissRow[];
  names: Record<string, string>;
  currentBattleId: string | null;
}

type EvDict = ReturnType<typeof useI18n>['t']['ev'];
const roundName = (t: EvDict, r: number, total: number) =>
  r === total ? t.final : r === total - 1 ? t.semis : r === total - 2 ? t.quarters : t.roundOf(2 ** (total - r + 1));

export default function Bracket({ eventId, isHost, live, mainFormat, matches, swiss, names, currentBattleId }: Props) {
  const t = useI18n().t.ev;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [woFor, setWoFor] = useState<string | null>(null);

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

  const ko = matches.filter((m) => m.phase === 'knockout');
  const small = matches.find((m) => m.phase === 'small_final');
  const koRounds = ko.length ? Math.max(...ko.map((m) => m.round), Math.round(Math.log2(ko.filter((m) => m.round === 1).length * 2))) : 0;
  const swissRounds = [...new Set(matches.filter((m) => m.phase === 'swiss').map((m) => m.round))].sort((a, b) => a - b);
  const onStage = (m: MatchRow) => !!currentBattleId && m.battle_id === currentBattleId;

  const Box = ({ m, label }: { m: MatchRow; label?: string }) => {
    const decided = !!m.winner_id;
    const ready = !!m.a_id && !!m.b_id;
    const side = (id: string | null) => (
      <span className={`flex items-center justify-between gap-2 px-3 py-1.5 ${decided && m.winner_id === id ? 'font-bold' : decided ? 'text-muted line-through decoration-1' : ''}`}>
        <span className="truncate">{id ? names[id] ?? '?' : t.tbd}</span>
        {decided && m.winner_id === id && <span className="text-xs text-win">{m.walkover ? t.wo : t.won}</span>}
      </span>
    );
    return (
      <div className={`grid gap-0 overflow-hidden rounded-xl border bg-surface text-sm ${onStage(m) ? 'border-sub shadow-[0_0_0_2px_var(--sub)]' : 'border-line'}`}>
        {label && <span className="border-b border-line px-3 py-1 text-xs text-muted">{label}</span>}
        {side(m.a_id)}
        <span className="border-t border-line" />
        {side(m.b_id)}
        {(onStage(m) || (decided && m.battle_id) || (isHost && ready && !decided)) && (
        <span className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-1.5 text-xs">
          {onStage(m) && <span className="font-semibold text-sub">{t.onStageNow}</span>}
          {decided && m.battle_id && <Link href={`/battles/${m.battle_id}`} className="text-muted underline underline-offset-4">{t.replay}</Link>}
          {isHost && live && ready && !decided && !onStage(m) && (
            <button disabled={busy} onClick={() => act('host_open_match', { p_match: m.id })} className="rounded-full bg-ink px-3 py-1 text-paper disabled:opacity-50">{t.putOnStage}</button>
          )}
          {isHost && ready && !decided && (
            woFor === m.id ? (
              <span className="flex flex-wrap gap-1">
                {t.walkoverTo}
                {[m.a_id!, m.b_id!].map((id) => (
                  <button key={id} disabled={busy} onClick={() => act('host_award_match', { p_match: m.id, p_winner: id })} className="underline underline-offset-4">{names[id]}</button>
                ))}
                <button onClick={() => setWoFor(null)} className="text-muted">{t.cancel}</button>
              </span>
            ) : (
              <button onClick={() => setWoFor(m.id)} className="text-muted underline underline-offset-4">{t.noShowQ}</button>
            )
          )}
        </span>
        )}
      </div>
    );
  };

  return (
    <section className="grid gap-6" aria-label={t.mainStage}>
      {error && <p role="alert" className="text-loss">{error}</p>}

      {mainFormat === 'swiss' && swissRounds.length > 0 && (
        <div className="grid gap-5">
          <h3 className="text-xl font-bold [font-stretch:112%]">{t.swissRounds}</h3>
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div className="grid gap-4">
              {swissRounds.map((r) => (
                <div key={r} className="grid gap-2">
                  <p className="text-sm text-muted">{t.roundN(r)}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {matches.filter((m) => m.phase === 'swiss' && m.round === r).sort((a, b) => a.slot - b.slot).map((m) => <Box key={m.id} m={m} />)}
                  </div>
                </div>
              ))}
            </div>
            <div className="grid content-start gap-2">
              <p className="text-sm text-muted">{t.swissStandings}</p>
              <ol className="grid border-t-2 border-ink text-sm">
                {swiss.map((s) => (
                  <li key={s.profile_id} className={`grid grid-cols-[1.5rem_1fr_auto_auto] gap-3 border-b py-1.5 ${s.pos === 4 ? 'border-b-2 border-sub' : 'border-line'}`}>
                    <span className="num text-muted">{s.pos}</span>
                    <span className="truncate">{names[s.profile_id]}</span>
                    <span className="num">{t.wins(s.wins)}</span>
                    <span className="num text-muted">{s.buchholz}</span>
                  </li>
                ))}
              </ol>
              <p className="text-xs text-muted">{t.top4Note}</p>
            </div>
          </div>
        </div>
      )}

      {ko.length > 0 && (
        <div className="grid gap-3">
          <h3 className="text-xl font-bold [font-stretch:112%]">{mainFormat === 'swiss' ? t.top4 : t.knockout}</h3>
          <div className="overflow-x-auto pb-2">
            <div className="grid min-w-max auto-cols-[minmax(13rem,1fr)] grid-flow-col gap-4">
              {Array.from({ length: koRounds }, (_, i) => i + 1).map((r) => {
                const inRound = ko.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot);
                const expected = ko.filter((m) => m.round === 1).length / 2 ** (r - 1);
                return (
                  <div key={r} className="grid grid-rows-[auto_1fr] gap-3">
                    <p className="text-sm text-muted">{roundName(t, r, koRounds)}</p>
                    <div className="grid content-around gap-3">
                      {inRound.map((m) => <Box key={m.id} m={m} />)}
                      {Array.from({ length: Math.max(0, expected - inRound.length) }, (_, k) => (
                        <div key={`tbd-${k}`} className="grid min-h-20 place-items-center rounded-xl border border-dashed border-line px-3 text-center text-sm text-muted">
                          {t.winnersOf(roundName(t, r - 1, koRounds))}
                        </div>
                      ))}
                      {r === koRounds && small && <Box m={small} label={t.smallFinal} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
