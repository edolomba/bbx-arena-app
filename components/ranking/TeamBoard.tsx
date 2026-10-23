import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { record } from '@/lib/format';
import Avatar from '@/components/Avatar';

type Member = { username: string; avatar_url: string | null; country: string | null };
export type Row = { rank: number; team_id: string; name: string; elo: number; peak: number; wins: number; losses: number; draws: number; battles: number; total_points: number; members: Member[] | null };

const ELITE = 10;
const MEDAL = ['', '🥇', '🥈', '🥉'];

function Pair({ members, size, ring }: { members: Member[]; size: 'sm' | 'md' | 'lg' | 'podiumSide'; ring: 'gold' | 'elite' | 'muted' }) {
  return (
    <span className="flex -space-x-3">
      {members.map((m) => <Avatar key={m.username} username={m.username} url={m.avatar_url} size={size} ring={ring} />)}
    </span>
  );
}

/** Tag Team ranking: podium of the top three duos, then the list (top 10 = ELITE). */
export default async function TeamBoard() {
  const supabase = await createClient();
  const { data } = await supabase.rpc('team_board', { p_limit: 100 });
  return <TeamBoardView rows={((data ?? []) as Row[]).filter((r) => (r.members ?? []).length === 2)} />;
}

export async function TeamBoardView({ rows }: { rows: Row[] }) {
  const { t: all } = await getT();
  const t = all.teams;
  const b = all.board;

  if (rows.length === 0) {
    return (
      <div className="grid justify-items-start gap-4 rounded-2xl border border-dashed border-line p-8">
        <p className="text-muted">{t.none}</p>
        <Link href="/teams" className="rounded-full bg-ink px-6 py-3 text-paper">{all.home.spotCreate}</Link>
      </div>
    );
  }

  const rated = (r: Row) => r.battles > 0;
  const podium = [rows[1], rows[0], rows[2]].filter(Boolean);
  const membersLine = (r: Row) => (r.members ?? []).map((m) => m.username).join(' & ');

  return (
    <div className="grid gap-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[62ch] text-sm text-muted">{t.lead}</p>
        <Link href="/teams" className="rounded-full border border-line px-5 py-2 text-sm hover:border-muted">{all.home.spotCreate}</Link>
      </div>

      <section aria-label={`Top ${podium.length}`} className="grid grid-cols-3 items-end gap-2 sm:gap-4 md:mx-auto md:w-full md:max-w-3xl">
        {podium.map((r) => {
          const first = r.rank === 1;
          return (
            <Link key={r.team_id} href={`/teams/${r.team_id}`}
              className={`grid justify-items-center gap-1.5 rounded-2xl border px-2 pt-4 text-center transition-transform hover:-translate-y-1 sm:px-4
                ${first ? 'border-gold/40 bg-gradient-to-b from-gold/20 via-gold/5 to-transparent sm:pt-6' : 'border-line bg-gradient-to-b from-sub/12 to-transparent'}`}>
              <span className="text-xl" aria-hidden="true">{MEDAL[r.rank]}</span>
              <Pair members={r.members ?? []} size={first ? 'lg' : 'podiumSide'} ring={first ? 'gold' : 'elite'} />
              <span className={`mt-1 max-w-full truncate font-bold ${first ? 'text-lg' : ''}`}>{r.name}</span>
              <span className="max-w-full truncate text-xs text-muted">{membersLine(r)}</span>
              <span className={`num font-bold ${first ? 'text-3xl text-gold sm:text-4xl' : 'text-2xl text-sub'}`}>{r.elo}</span>
              <span className="font-mono text-sm text-muted">{record(r.wins, r.losses, r.draws)}</span>
              <span className={`mt-3 h-3 w-[90%] rounded-t-lg ${first ? 'h-10 bg-gradient-to-b from-gold to-gold/0' : 'bg-gradient-to-b from-sub/80 to-sub/0'}`} aria-hidden="true" />
            </Link>
          );
        })}
      </section>

      <section className="grid gap-3">
        <h2 className="flex items-center gap-3 font-mono text-xs font-semibold tracking-[0.2em] text-sub uppercase">
          <span aria-hidden="true">◆</span>{b.elite}<span className="h-px flex-1 bg-gradient-to-r from-current to-transparent opacity-40" aria-hidden="true" />
        </h2>
        <ol className="grid gap-2">
          {rows.map((r) => {
            const first = r.rank === 1 && rated(r);
            const elite = r.rank <= ELITE && rated(r);
            return (
              <li key={r.team_id}>
                <Link href={`/teams/${r.team_id}`}
                  className={`grid grid-cols-[2.5rem_auto_1fr_auto] items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors sm:grid-cols-[3rem_auto_1fr_auto_auto] sm:gap-4 sm:px-4
                    ${first ? 'border-gold/40 bg-gradient-to-r from-gold/12 to-surface shadow-[inset_3px_0_0_var(--gold)]'
                      : elite ? 'border-line bg-surface shadow-[inset_3px_0_0_var(--sub)] hover:border-sub/50' : 'border-line bg-surface hover:border-muted'}`}>
                  <span className={`num text-center ${r.rank <= 3 ? 'text-2xl' : 'text-lg text-muted'}`}>{r.rank <= 3 ? MEDAL[r.rank] : `#${r.rank}`}</span>
                  <Pair members={r.members ?? []} size="sm" ring={first ? 'gold' : elite ? 'elite' : 'muted'} />
                  <span className="grid min-w-0">
                    <span className="truncate font-bold">{r.name}</span>
                    <span className="truncate text-xs text-muted">{membersLine(r)}</span>
                  </span>
                  <span className="grid w-[6.5rem] justify-items-end text-right">
                    <span className={`num text-xl font-bold ${first ? 'text-gold' : ''}`}>{r.elo}</span>
                    <span className="font-mono text-[0.7rem] text-muted">{r.peak > r.elo ? b.peak(r.peak) : `${r.total_points} pts`}</span>
                  </span>
                  <span className="hidden w-16 text-right font-mono text-sm text-muted sm:block">{record(r.wins, r.losses, r.draws)}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
