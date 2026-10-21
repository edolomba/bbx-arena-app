'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { eventRpc } from '@/lib/supabase/events';
import { useI18n } from '@/components/i18n/I18nProvider';
import { LOCALE_TAG, type Locale } from '@/lib/i18n/config';
import Countdown from '@/components/Countdown';
import EventStage from './EventStage';
import JudgeRanking from './JudgeRanking';
import StandingsTable from './StandingsTable';
import Bracket, { type MatchRow, type SwissRow } from './Bracket';
import SmokeBoard, { type SmokeRow } from './SmokeBoard';
import type { EventEntry, EventJudge, EventRow, EventShowcase, StandingRow } from '@/lib/types';

interface Props {
  event: EventRow;
  judges: EventJudge[];
  entries: EventEntry[];
  showcases: EventShowcase[];
  submissions: { judge_id: string; submitted_at: string }[];
  standings: StandingRow[];
  myRanking: string[];
  currentUserId: string | null;
  matches: MatchRow[];
  swiss: SwissRow[];
  smoke: SmokeRow[];
  stage: React.ReactNode;
}

const when = (iso: string, locale: Locale) => new Date(iso).toLocaleString(LOCALE_TAG[locale], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function EventView({ event, judges, entries, showcases, submissions, standings, myRanking, currentUserId, matches, swiss, smoke, stage }: Props) {
  const { locale, t: all } = useI18n();
  const t = all.evp;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [newJudge, setNewJudge] = useState('');
  const [tieOrder, setTieOrder] = useState<string[] | null>(null);

  // Live updates: the host's actions, new entries and new showcases refresh the page data.
  useEffect(() => {
    const ch = supabase.channel(`event:${event.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${event.id}` }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_entries', filter: `event_id=eq.${event.id}` }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_showcases', filter: `event_id=eq.${event.id}` }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'elimination_submissions', filter: `event_id=eq.${event.id}` }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_matches', filter: `event_id=eq.${event.id}` }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_smoke', filter: `event_id=eq.${event.id}` }, () => router.refresh())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [supabase, event.id, router]);

  const isHost = currentUserId === event.host_id;
  const activeJudges = judges.filter((j) => j.active);
  const isJudge = !!currentUserId && activeJudges.some((j) => j.judge_id === currentUserId);
  const myEntry = entries.find((e) => e.profile_id === currentUserId);
  const registered = entries.filter((e) => ['registered', 'qualified', 'eliminated'].includes(e.status));
  const names = Object.fromEntries(entries.map((e) => [e.profile_id, e.profile?.username ?? '']));
  const performedIds = showcases.map((s) => s.profile_id);
  const performers = entries.filter((e) => e.status === 'registered' && performedIds.includes(e.profile_id))
    .map((e) => ({ profile_id: e.profile_id, username: e.profile?.username ?? '' }));
  const submittedIds = submissions.map((s) => s.judge_id);
  const mySubmission = submissions.find((s) => s.judge_id === currentUserId);
  const closed = new Date(event.registration_closes_at).getTime() < Date.now();

  async function act(fn: string, args: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    try {
      await eventRpc(supabase, fn, { p_event: event.id, ...args });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failed);
    } finally {
      setBusy(false);
    }
  }

  const rankedLabel = event.ranked ? (event.approved_at ? t.ranked : t.rankedPending) : t.casual;
  const tiedRows = standings.filter((r) => r.tied && r.place <= event.advance_count);
  const tiedGroup = tiedRows.length ? standings.filter((r) => r.tied && r.place === tiedRows[0].place) : [];
  const btn = 'rounded-full px-5 py-2.5 disabled:opacity-50';

  return (
    <article className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6">
      <header className="grid gap-4">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`rounded-full px-2.5 py-0.5 font-semibold text-paper ${event.status === 'finished' ? 'bg-win' : 'bg-sub'}`}>
            {all.ev.status[event.status]}{event.live ? all.ev.liveNow : ''}
          </span>
          <span className="rounded-full border border-line px-2.5 py-0.5 text-muted">{rankedLabel}</span>
          <span className="text-muted">{t.hostedBy} <Link href={`/beatboxers/${event.host?.username}`} className="underline-offset-4 hover:underline">@{event.host?.username}</Link></span>
        </p>
        <h1 className="handle text-[clamp(2.2rem,6vw,4rem)] leading-none">{event.title}</h1>
        {event.description && <p className="max-w-[68ch] whitespace-pre-wrap">{event.description}</p>}
        <p className="text-sm text-muted">
          {t.summary(event.max_participants, event.advance_count, event.main_format === 'swiss' ? t.toSwiss : event.main_format === 'seven_to_smoke' ? t.toSmoke(event.smoke_target ?? 7) : t.toKnockout)}
          {' '}{t.timing(event.showcase_seconds, event.battle_rounds, event.battle_round_seconds)}
          {' '}{t.judges(activeJudges.map((j) => `@${j.judge?.username}`).join(', '))}
        </p>
        {!event.live && event.next_session_at && event.status !== 'finished' && (
          <p className="justify-self-start rounded-xl border-2 border-sub px-4 py-2">
            {t.nextSession} <strong>{when(event.next_session_at, locale)}</strong> (<Countdown to={event.next_session_at} />)
          </p>
        )}
      </header>

      {error && <p role="alert" className="text-loss">{error}</p>}

      {/* ---------- Registration ---------- */}
      {event.status === 'registration' && (
        <section className="grid gap-4">
          <h2 className="text-2xl font-bold [font-stretch:112%]">{t.registration}</h2>
          <p>
            <span className="num text-2xl">{registered.length}</span> {t.ofRegistered(event.max_participants)}{' '}
            {closed ? t.regClosed : <>{t.closesIn} <Countdown to={event.registration_closes_at} />.</>}
          </p>
          {!currentUserId ? (
            <p><Link href={`/login?next=/events/${event.id}`} className="underline underline-offset-4">{t.logIn}</Link> {t.toRegister}</p>
          ) : isHost || isJudge ? null : myEntry?.status === 'registered' ? (
            <button disabled={busy} onClick={() => act('withdraw_event')} className={`${btn} justify-self-start border border-line`}>{t.withdraw}</button>
          ) : !closed ? (
            <button disabled={busy} onClick={() => act('register_event')} className={`${btn} justify-self-start bg-ink text-paper`}>{t.register}</button>
          ) : null}
          {registered.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {registered.map((e) => (
                <li key={e.profile_id} className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-sm">
                  @{e.profile?.username}
                  {isHost && <button onClick={() => act('host_remove_entry', { p_profile: e.profile_id })} aria-label={t.remove(e.profile?.username ?? '')} className="text-muted">×</button>}
                </li>
              ))}
            </ul>
          )}
          {isHost && (
            <div className="grid justify-items-start gap-2 rounded-2xl border-2 border-ink p-5">
              <h3 className="font-bold">{t.host}</h3>
              <p className="text-sm text-muted">{t.startHint}</p>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} onClick={() => act('host_start_eliminations')} className={`${btn} bg-ink text-paper`}>{t.startElims}</button>
                {event.main_format === 'seven_to_smoke' && registered.length >= 3 && registered.length <= 8 && (
                  <button disabled={busy} onClick={() => act('host_skip_eliminations')} className={`${btn} border border-line`}>
                    {t.skipElims}
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ---------- Live eliminations ---------- */}
      {event.status === 'eliminations' && (
        <EventStage event={event} entries={entries} performedIds={performedIds} currentUserId={currentUserId} />
      )}

      {/* ---------- Judging ---------- */}
      {event.status === 'judging' && (
        <section className="grid gap-6">
          <div className="grid gap-2">
            <h2 className="text-2xl font-bold [font-stretch:112%]">{t.judgesRanking}</h2>
            <p className="text-muted">{t.judgesSent(submittedIds.filter((id) => activeJudges.some((j) => j.judge_id === id)).length, event.judge_count)}</p>
            <ul className="flex flex-wrap gap-2 text-sm">
              {activeJudges.map((j) => (
                <li key={j.judge_id} className={`flex items-center gap-2 rounded-full border px-3 py-1 ${submittedIds.includes(j.judge_id) ? 'border-win text-win' : 'border-line'}`}>
                  @{j.judge?.username} {submittedIds.includes(j.judge_id) ? '✓' : ''}
                  {isHost && <button onClick={() => { setReplacing(j.judge_id); setNewJudge(''); }} className="text-muted underline">{t.replace}</button>}
                </li>
              ))}
            </ul>
            {isHost && replacing && (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                {t.replaceWith(activeJudges.find((j) => j.judge_id === replacing)?.judge?.username ?? '')}
                <input value={newJudge} onChange={(e) => setNewJudge(e.target.value.replace(/^@/, ''))} placeholder={t.handle} className="rounded-lg border border-line bg-surface px-2 py-1" />
                <button disabled={busy || !newJudge} onClick={async () => { await act('host_replace_event_judge', { p_old: replacing, p_new_handle: newJudge }); setReplacing(null); }} className="rounded-full bg-ink px-3 py-1 text-paper">{t.confirm}</button>
                <button onClick={() => setReplacing(null)} className="text-muted">{t.cancel}</button>
              </p>
            )}
          </div>

          {isJudge && (
            <JudgeRanking eventId={event.id} performers={performers} showcases={showcases} savedOrder={myRanking} submittedAt={mySubmission?.submitted_at ?? null} />
          )}

          {isHost && standings.length > 0 && (
            <div className="grid gap-4 rounded-2xl border-2 border-ink p-5">
              <h3 className="text-xl font-bold [font-stretch:112%]">{t.preview}</h3>
              <StandingsTable rows={standings} names={Object.fromEntries(performers.map((p) => [p.profile_id, p.username]))} advanceCount={event.advance_count} />
              {tiedGroup.length > 0 && (
                <div className="grid gap-2 rounded-xl border border-loss p-4">
                  <p>{t.tiedHint}</p>
                  <ol className="grid gap-1">
                    {(tieOrder ?? tiedGroup.map((r) => r.profile_id)).map((id, i, arr) => (
                      <li key={id} className="flex items-center gap-2">
                        <span className="num w-6">{i + 1}</span>@{names[id]}
                        <button disabled={i === 0} onClick={() => { const n = [...arr]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setTieOrder(n); }} className="rounded-full border border-line px-2 disabled:opacity-30" aria-label={t.moveUp}>↑</button>
                        <button disabled={i === arr.length - 1} onClick={() => { const n = [...arr]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setTieOrder(n); }} className="rounded-full border border-line px-2 disabled:opacity-30" aria-label={t.moveDown}>↓</button>
                      </li>
                    ))}
                  </ol>
                  <button disabled={busy} onClick={async () => { await act('host_break_tie', { p_order: tieOrder ?? tiedGroup.map((r) => r.profile_id) }); setTieOrder(null); }} className={`${btn} justify-self-start bg-ink text-paper`}>{t.saveOrder}</button>
                </div>
              )}
              <button disabled={busy} onClick={() => act('host_publish_eliminations')} className={`${btn} justify-self-start bg-sub text-paper`}>{t.publish}</button>
            </div>
          )}
        </section>
      )}

      {/* ---------- Final result ---------- */}
      {event.status === 'finished' && (
        <section className="grid gap-4" aria-label={t.finalResult}>
          <h2 className="text-2xl font-bold [font-stretch:112%]">{t.finalResult}</h2>
          <ol className="grid gap-3 sm:grid-cols-3">
            {[1, 2, 3].map((place) => {
              const e = entries.find((x) => (x as EventEntry & { final_place?: number }).final_place === place);
              return (
                <li key={place} className={`grid gap-1 rounded-2xl p-5 ${place === 1 ? 'bg-ink text-paper' : 'border border-line bg-surface'}`}>
                  <span className="num text-4xl leading-none">{t.places[place - 1]}</span>
                  <span className="handle text-xl">{e ? `@${e.profile?.username}` : '—'}</span>
                  {event.ranked && event.approved_at && <span className="text-sm opacity-70">{t.points(place === 1 ? 1000 : place === 2 ? 500 : 350)}</span>}
                </li>
              );
            })}
          </ol>
          <ol className="grid border-t-2 border-ink text-sm sm:grid-cols-2 sm:gap-x-8">
            {entries.filter((x) => (x as EventEntry & { final_place?: number }).final_place && (x as EventEntry & { final_place?: number }).final_place! > 3)
              .sort((a, b) => ((a as EventEntry & { final_place: number }).final_place - (b as EventEntry & { final_place: number }).final_place))
              .map((x) => (
                <li key={x.profile_id} className="flex justify-between border-b border-line py-1.5">
                  <span>@{x.profile?.username}</span>
                  <span className="num text-muted">{(x as EventEntry & { final_place: number }).final_place}</span>
                </li>
              ))}
          </ol>
        </section>
      )}

      {/* ---------- Main stage ---------- */}
      {['main', 'finished'].includes(event.status) && (
        <section className="grid gap-6">
          {event.status === 'main' && (
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="mr-auto text-2xl font-bold [font-stretch:112%]">{t.mainStage}</h2>
              {isHost && matches.length === 0 && (
                <button disabled={busy} onClick={() => act('host_build_bracket')} className={`${btn} bg-ink text-paper`}>
                  {event.main_format === 'seven_to_smoke' ? t.startSmoke : event.main_format === 'swiss' ? t.buildSwiss : t.buildBracket}
                </button>
              )}
              {isHost && (event.live
                ? <button disabled={busy} onClick={() => act('host_pause_event', { p_next_session: null })} className={`${btn} border border-line`}>{t.pause}</button>
                : <button disabled={busy} onClick={() => act('host_resume_event')} className={`${btn} bg-ink text-paper`}>{t.resume}</button>)}
            </div>
          )}
          {stage && (
            <div className="rounded-3xl border-2 border-sub">
              <p className="px-5 pt-4 text-sm font-semibold text-sub">{t.onStageNow}</p>
              {stage}
            </div>
          )}
          {event.main_format === 'seven_to_smoke' && matches.length > 0 && (
            <SmokeBoard eventId={event.id} isHost={isHost} live={event.live} target={event.smoke_target ?? 7} smoke={smoke}
              matches={matches} names={names} currentBattleId={(event as EventRow & { current_battle_id?: string | null }).current_battle_id ?? null} />
          )}
          {event.main_format !== 'seven_to_smoke' && matches.length > 0 && (
            <Bracket eventId={event.id} isHost={isHost} live={event.live} mainFormat={event.main_format}
              matches={matches} swiss={swiss} names={names} currentBattleId={(event as EventRow & { current_battle_id?: string | null }).current_battle_id ?? null} />
          )}
          {standings.length > 0 && <details className="grid gap-4" open={event.status === 'main' && matches.length === 0}>
            <summary className="cursor-pointer text-lg font-bold [font-stretch:112%]">{t.officialElims}</summary>
            <div className="mt-4"><StandingsTable rows={standings} names={names} advanceCount={event.advance_count} /></div>
          </details>}
        </section>
      )}
    </article>
  );
}
