'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { EVENT_STATUS_LABEL, eventRpc } from '@/lib/supabase/events';
import Countdown from '@/components/Countdown';
import EventStage from './EventStage';
import JudgeRanking from './JudgeRanking';
import StandingsTable from './StandingsTable';
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
}

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function EventView({ event, judges, entries, showcases, submissions, standings, myRanking, currentUserId }: Props) {
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
      setError(err instanceof Error ? err.message : 'That didn’t work.');
    } finally {
      setBusy(false);
    }
  }

  const rankedLabel = event.ranked ? (event.approved_at ? 'Ranked' : 'Ranked, awaiting approval') : 'Casual';
  const tiedRows = standings.filter((r) => r.tied && r.place <= event.advance_count);
  const tiedGroup = tiedRows.length ? standings.filter((r) => r.tied && r.place === tiedRows[0].place) : [];
  const btn = 'rounded-full px-5 py-2.5 disabled:opacity-50';

  return (
    <article className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6">
      <header className="grid gap-4">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`rounded-full px-2.5 py-0.5 font-semibold text-paper ${event.status === 'finished' ? 'bg-win' : 'bg-sub'}`}>
            {EVENT_STATUS_LABEL[event.status]}{event.live ? ', live now' : ''}
          </span>
          <span className="rounded-full border border-line px-2.5 py-0.5 text-muted">{rankedLabel}</span>
          <span className="text-muted">Hosted by <Link href={`/beatboxers/${event.host?.username}`} className="underline-offset-4 hover:underline">@{event.host?.username}</Link></span>
        </p>
        <h1 className="handle text-[clamp(2.2rem,6vw,4rem)] leading-none">{event.title}</h1>
        {event.description && <p className="max-w-[68ch] whitespace-pre-wrap">{event.description}</p>}
        <p className="text-sm text-muted">
          Up to {event.max_participants} beatboxers, top {event.advance_count} go to the {event.main_format === 'swiss' ? 'Swiss rounds' : 'knockout'}.
          {' '}Showcases {event.showcase_seconds} s, battles {event.battle_rounds === 1 ? '1 round' : '2 rounds'} of {event.battle_round_seconds} s.
          {' '}Judges: {activeJudges.map((j) => `@${j.judge?.username}`).join(', ')}.
        </p>
        {!event.live && event.next_session_at && event.status !== 'finished' && (
          <p className="justify-self-start rounded-xl border-2 border-sub px-4 py-2">
            Next session: <strong>{when(event.next_session_at)}</strong> (<Countdown to={event.next_session_at} />)
          </p>
        )}
      </header>

      {error && <p role="alert" className="text-loss">{error}</p>}

      {/* ---------- Registration ---------- */}
      {event.status === 'registration' && (
        <section className="grid gap-4">
          <h2 className="text-2xl font-bold [font-stretch:112%]">Registration</h2>
          <p>
            <span className="num text-2xl">{registered.length}</span> of {event.max_participants} registered.{' '}
            {closed ? 'Registration has closed.' : <>Closes in <Countdown to={event.registration_closes_at} />.</>}
          </p>
          {!currentUserId ? (
            <p><Link href={`/login?next=/events/${event.id}`} className="underline underline-offset-4">Log in</Link> to register.</p>
          ) : isHost || isJudge ? null : myEntry?.status === 'registered' ? (
            <button disabled={busy} onClick={() => act('withdraw_event')} className={`${btn} justify-self-start border border-line`}>Withdraw</button>
          ) : !closed ? (
            <button disabled={busy} onClick={() => act('register_event')} className={`${btn} justify-self-start bg-ink text-paper`}>Register for this event</button>
          ) : null}
          {registered.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {registered.map((e) => (
                <li key={e.profile_id} className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-sm">
                  @{e.profile?.username}
                  {isHost && <button onClick={() => act('host_remove_entry', { p_profile: e.profile_id })} aria-label={`Remove @${e.profile?.username}`} className="text-muted">×</button>}
                </li>
              ))}
            </ul>
          )}
          {isHost && (
            <div className="grid justify-items-start gap-2 rounded-2xl border-2 border-ink p-5">
              <h3 className="font-bold">Host</h3>
              <p className="text-sm text-muted">Start when everyone is ready. The running order is drawn at random, and the room opens for everyone.</p>
              <button disabled={busy} onClick={() => act('host_start_eliminations')} className={`${btn} bg-ink text-paper`}>Start the eliminations now</button>
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
            <h2 className="text-2xl font-bold [font-stretch:112%]">The judges are ranking</h2>
            <p className="text-muted">{submittedIds.filter((id) => activeJudges.some((j) => j.judge_id === id)).length} of {event.judge_count} judges have sent their ranking. The classification is published when everyone is done.</p>
            <ul className="flex flex-wrap gap-2 text-sm">
              {activeJudges.map((j) => (
                <li key={j.judge_id} className={`flex items-center gap-2 rounded-full border px-3 py-1 ${submittedIds.includes(j.judge_id) ? 'border-win text-win' : 'border-line'}`}>
                  @{j.judge?.username} {submittedIds.includes(j.judge_id) ? '✓' : ''}
                  {isHost && <button onClick={() => { setReplacing(j.judge_id); setNewJudge(''); }} className="text-muted underline">replace</button>}
                </li>
              ))}
            </ul>
            {isHost && replacing && (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                Replace @{activeJudges.find((j) => j.judge_id === replacing)?.judge?.username} with
                <input value={newJudge} onChange={(e) => setNewJudge(e.target.value.replace(/^@/, ''))} placeholder="handle" className="rounded-lg border border-line bg-surface px-2 py-1" />
                <button disabled={busy || !newJudge} onClick={async () => { await act('host_replace_event_judge', { p_old: replacing, p_new_handle: newJudge }); setReplacing(null); }} className="rounded-full bg-ink px-3 py-1 text-paper">Confirm</button>
                <button onClick={() => setReplacing(null)} className="text-muted">Cancel</button>
              </p>
            )}
          </div>

          {isJudge && (
            <JudgeRanking eventId={event.id} performers={performers} showcases={showcases} savedOrder={myRanking} submittedAt={mySubmission?.submitted_at ?? null} />
          )}

          {isHost && standings.length > 0 && (
            <div className="grid gap-4 rounded-2xl border-2 border-ink p-5">
              <h3 className="text-xl font-bold [font-stretch:112%]">Preview (only you see this)</h3>
              <StandingsTable rows={standings} names={Object.fromEntries(performers.map((p) => [p.profile_id, p.username]))} advanceCount={event.advance_count} />
              {tiedGroup.length > 0 && (
                <div className="grid gap-2 rounded-xl border border-loss p-4">
                  <p>These beatboxers are tied on every rule inside the qualifying places. Put them in order:</p>
                  <ol className="grid gap-1">
                    {(tieOrder ?? tiedGroup.map((r) => r.profile_id)).map((id, i, arr) => (
                      <li key={id} className="flex items-center gap-2">
                        <span className="num w-6">{i + 1}</span>@{names[id]}
                        <button disabled={i === 0} onClick={() => { const n = [...arr]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setTieOrder(n); }} className="rounded-full border border-line px-2 disabled:opacity-30" aria-label="Move up">↑</button>
                        <button disabled={i === arr.length - 1} onClick={() => { const n = [...arr]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setTieOrder(n); }} className="rounded-full border border-line px-2 disabled:opacity-30" aria-label="Move down">↓</button>
                      </li>
                    ))}
                  </ol>
                  <button disabled={busy} onClick={async () => { await act('host_break_tie', { p_order: tieOrder ?? tiedGroup.map((r) => r.profile_id) }); setTieOrder(null); }} className={`${btn} justify-self-start bg-ink text-paper`}>Save this order</button>
                </div>
              )}
              <button disabled={busy} onClick={() => act('host_publish_eliminations')} className={`${btn} justify-self-start bg-sub text-paper`}>Publish the official classification</button>
            </div>
          )}
        </section>
      )}

      {/* ---------- Published ---------- */}
      {['main', 'finished'].includes(event.status) && (
        <section className="grid gap-4">
          <h2 className="text-2xl font-bold [font-stretch:112%]">Eliminations: official classification</h2>
          <StandingsTable rows={standings} names={names} advanceCount={event.advance_count} />
          {event.status === 'main' && (
            <p className="rounded-xl border border-dashed border-line p-4 text-muted">
              The top {event.advance_count} go on to the {event.main_format === 'swiss' ? 'Swiss rounds' : 'knockout'}, small final and final.
              The bracket arrives with the next update of BBX Arena.
            </p>
          )}
        </section>
      )}
    </article>
  );
}
