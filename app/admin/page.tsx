import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AdminActions from '@/components/moderation/AdminActions';
import EventApproval from '@/components/moderation/EventApproval';
import { formatAgo } from '@/lib/format';

export const metadata = { title: 'Moderation' };
export const dynamic = 'force-dynamic';

const REASON: Record<string, string> = {
  offensive: 'Offensive', harassment: 'Harassment', stolen_content: 'Stolen content',
  cheating: 'Cheating', fake_account: 'Fake account', other: 'Other',
};

interface ReportRow {
  id: string;
  reason: string;
  details: string | null;
  status: 'open' | 'resolved' | 'dismissed';
  created_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  reporter: { username: string } | null;
  target: { id: string; username: string; suspended_at: string | null } | null;
  battle: {
    id: string; hidden_at: string | null;
    challenger: { id: string; username: string; suspended_at: string | null } | null;
    opponent: { id: string; username: string; suspended_at: string | null } | null;
  } | null;
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const showOpen = tab !== 'closed';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();
  const { data: me } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (!me?.is_admin) notFound();

  const P = 'id, username, suspended_at';
  const { data } = await supabase
    .from('reports')
    .select(`id, reason, details, status, created_at, resolved_at, resolution_note,
      reporter:profiles!reports_reporter_id_fkey(username),
      target:profiles!reports_profile_id_fkey(${P}),
      battle:battles(id, hidden_at, challenger:profiles!battles_challenger_id_fkey(${P}), opponent:profiles!battles_opponent_id_fkey(${P}))`)
    .in('status', showOpen ? ['open'] : ['resolved', 'dismissed'])
    .order('created_at', { ascending: !showOpen })
    .limit(100);
  const reports = (data ?? []) as unknown as ReportRow[];
  const { data: pending } = await supabase.from('events').select('id, title, max_participants, host:profiles!events_host_id_fkey(username)')
    .eq('ranked', true).is('approved_at', null).neq('status', 'cancelled').order('created_at');

  return (
    <main className="mx-auto grid max-w-4xl gap-6 px-4 py-10 sm:px-6">
      <h1 className="handle text-[clamp(2.2rem,6vw,3.6rem)] leading-none">Moderation</h1>
      <section className="grid gap-3">
        <h2 className="text-xl font-bold [font-stretch:112%]">Ranked events awaiting approval</h2>
        <EventApproval events={((pending ?? []) as unknown as { id: string; title: string; max_participants: number; host: { username: string } | null }[])
          .map((e) => ({ id: e.id, title: e.title, host: e.host?.username ?? '', max: e.max_participants }))} />
      </section>
      <h2 className="text-xl font-bold [font-stretch:112%]">Reports</h2>
      <nav className="flex gap-1">
        <Link href="/admin" aria-current={showOpen ? 'page' : undefined}
          className={`rounded-full px-4 py-1.5 text-sm ${showOpen ? 'bg-ink text-paper' : 'text-muted'}`}>Open reports</Link>
        <Link href="/admin?tab=closed" aria-current={!showOpen ? 'page' : undefined}
          className={`rounded-full px-4 py-1.5 text-sm ${!showOpen ? 'bg-ink text-paper' : 'text-muted'}`}>Closed</Link>
      </nav>

      {reports.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-8 text-muted">{showOpen ? 'No open reports. All clear.' : 'Nothing closed yet.'}</p>
      ) : (
        <ul className="grid gap-4">
          {reports.map((r) => {
            const people = [r.target, r.battle?.challenger, r.battle?.opponent]
              .filter((p): p is { id: string; username: string; suspended_at: string | null } => !!p)
              .filter((p, i, all) => all.findIndex((q) => q.id === p.id) === i);
            return (
              <li key={r.id} className="grid gap-3 rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{REASON[r.reason] ?? r.reason}</p>
                  <p className="text-sm text-muted">by @{r.reporter?.username ?? 'deleted'}, {formatAgo(r.created_at)}</p>
                </div>
                <p className="text-sm">
                  {r.battle ? (
                    <>Battle: <Link href={`/battles/${r.battle.id}`} className="underline underline-offset-4">
                      @{r.battle.challenger?.username} vs @{r.battle.opponent?.username ?? 'open slot'}</Link>
                      {r.battle.hidden_at && <span className="ml-2 text-loss">hidden</span>}</>
                  ) : r.target ? (
                    <>Profile: <Link href={`/beatboxers/${r.target.username}`} className="underline underline-offset-4">@{r.target.username}</Link></>
                  ) : 'Target no longer exists'}
                </p>
                {r.details && <p className="rounded-lg bg-paper p-3 text-sm whitespace-pre-wrap">{r.details}</p>}
                {r.status !== 'open' && (
                  <p className="text-sm text-muted">{r.status === 'resolved' ? 'Resolved' : 'Dismissed'}{r.resolution_note ? `: ${r.resolution_note}` : ''}</p>
                )}
                <AdminActions
                  reportId={r.id}
                  status={r.status}
                  battle={r.battle ? { id: r.battle.id, hidden: !!r.battle.hidden_at } : null}
                  users={people.map((p) => ({ id: p.id, username: p.username, suspended: !!p.suspended_at }))}
                />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
