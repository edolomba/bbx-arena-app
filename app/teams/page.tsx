import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { record } from '@/lib/format';
import CreateTeamForm from '@/components/teams/CreateTeamForm';
import TeamActions from '@/components/teams/TeamActions';
import TeamMembers, { type Member } from '@/components/teams/TeamMembers';

export const metadata = { title: 'Tag Teams' };
export const dynamic = 'force-dynamic';

type Row = { rank: number; team_id: string; name: string; elo: number; wins: number; losses: number; draws: number; battles: number; total_points: number; members: Member[] | null };

export default async function TeamsPage() {
  const supabase = await createClient();
  const { t: all } = await getT();
  const t = all.teams;
  const [{ data: { user } }, { data: board }] = await Promise.all([supabase.auth.getUser(), supabase.rpc('team_board', { p_limit: 100 })]);
  const rows = (board ?? []) as Row[];
  const { data: invites } = user
    ? await supabase.from('team_members').select('team:teams!inner(id, name, status, created_by, creator:profiles!teams_created_by_fkey(username))').eq('profile_id', user.id).eq('status', 'invited')
    : { data: [] };
  const open = ((invites ?? []) as unknown as { team: { id: string; name: string; status: string; creator: { username: string } | null } }[]).filter((i) => i.team.status === 'pending');

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6">
      <header className="grid gap-3">
        <h1 className="handle text-[clamp(2.4rem,7vw,4.2rem)] leading-none">{t.title}</h1>
        <p className="max-w-[62ch] text-muted">{t.lead}</p>
        <nav className="flex flex-wrap gap-2 text-sm">
          <Link href="/ranking?scope=tag" className="rounded-full border border-line px-4 py-1.5 text-muted hover:text-ink">🏆 {all.rank.title}: {t.tab}</Link>
        </nav>
      </header>

      {open.length > 0 && (
        <section className="grid gap-3 rounded-2xl border border-gold/40 bg-gold/5 p-5">
          <h2 className="text-lg font-bold">{t.invites}</h2>
          {open.map((i) => (
            <div key={i.team.id} className="flex flex-wrap items-center justify-between gap-3">
              <span><strong>{i.team.name}</strong> <span className="text-muted">· @{i.team.creator?.username}</span></span>
              <TeamActions teamId={i.team.id} name={i.team.name} mode="invited" />
            </div>
          ))}
        </section>
      )}

      {user ? <CreateTeamForm /> : <p className="text-muted"><Link href="/login?next=/teams" className="underline underline-offset-4">{all.nav.logIn}</Link> · {t.loginToCreate}</p>}

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-8 text-muted">{t.none}</p>
      ) : (
        <ol className="grid gap-2">
          {rows.map((r) => (
            <li key={r.team_id}>
              <Link href={`/teams/${r.team_id}`}
                className={`grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 rounded-xl border bg-surface px-4 py-3 transition-colors sm:grid-cols-[3rem_1fr_auto_auto] ${r.rank === 1 && r.battles > 0 ? 'border-gold/40 shadow-[inset_3px_0_0_var(--gold)]' : r.rank <= 10 && r.battles > 0 ? 'border-line shadow-[inset_3px_0_0_var(--sub)]' : 'border-line hover:border-muted'}`}>
                <span className="num text-center text-lg text-muted">#{r.rank}</span>
                <span className="grid min-w-0 gap-1">
                  <span className="truncate text-lg font-bold">{r.name}</span>
                  <TeamMembers members={r.members ?? []} size="xs" />
                </span>
                <span className="grid justify-items-end">
                  <span className={`num text-xl font-bold ${r.rank === 1 && r.battles > 0 ? 'text-gold' : ''}`}>{r.elo}</span>
                  <span className="font-mono text-[0.7rem] text-muted">{record(r.wins, r.losses, r.draws)}</span>
                </span>
                <span className="hidden w-20 text-right font-mono text-sm text-muted sm:block">{r.total_points} pts</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
