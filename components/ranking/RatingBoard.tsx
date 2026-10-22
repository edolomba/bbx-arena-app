import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import Avatar from '@/components/Avatar';
import BadgeChip from '@/components/badges/BadgeChip';
import Podium from './Podium';

export interface BoardRow {
  rank: number; profile_id: string; username: string; avatar_url: string | null; country: string | null;
  featured_badge: string | null; elo: number; peak: number; wins: number; battles: number;
  last5: string; spark: number[]; last_delta: number | null; upsets: number;
}
export interface Fire { profile_id: string; username: string; avatar_url: string | null; gain: number }
type Rec = { value: number; username: string; avatar_url: string | null; beaten?: string; battles?: number } | null;
export interface Records { highest_elo: Rec; longest_streak: Rec; biggest_upset: Rec; most_battles: Rec; best_win_rate: Rec }

const ELITE = 10;
const MEDAL = ['', '🥇', '🥈', '🥉'];

/** Rating line: green when the beatboxer is up over the window, red when down. */
function Spark({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return <span className="hidden w-24 sm:block" />;
  const W = 96, H = 28;
  const min = Math.min(...values), max = Math.max(...values);
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => (max === min ? H / 2 : H - 2 - ((v - min) / (max - min)) * (H - 4));
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const up = values[values.length - 1] >= values[0];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hidden h-7 w-24 sm:block" role="img" aria-label={label}>
      <path d={d} fill="none" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round"
        className={up ? 'stroke-win' : 'stroke-loss'} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Last five results as dots, oldest left: green win, red loss, grey draw. */
function Form({ last5, label }: { last5: string; label: string }) {
  const slots = [...Array(Math.max(0, 5 - last5.length)).fill(' '), ...last5.split('')];
  return (
    <span className="hidden w-14 justify-end gap-1 md:flex" role="img" aria-label={label}>
      {slots.map((c, i) => (
        <span key={i} className={`size-2 rounded-full ${c === 'W' ? 'bg-win' : c === 'L' ? 'bg-loss/70' : c === 'D' ? 'bg-muted' : 'bg-line'}`} />
      ))}
    </span>
  );
}

export default async function RatingBoard() {
  const supabase = await createClient();
  const [{ data: rows }, { data: fire }, { data: rec }] = await Promise.all([
    supabase.rpc('rating_board', { p_limit: 100 }),
    supabase.rpc('rating_on_fire', { p_limit: 5 }),
    supabase.rpc('rating_records'),
  ]);
  return <RatingBoardView board={(rows ?? []) as BoardRow[]} onFire={(fire ?? []) as Fire[]} records={(rec ?? {}) as Records} />;
}

export async function RatingBoardView({ board, onFire, records }: { board: BoardRow[]; onFire: Fire[]; records: Records }) {
  const { t: all } = await getT();
  const t = all.board;

  if (board.length === 0) {
    return <p className="rounded-2xl border border-dashed border-line p-8 text-muted">{t.empty}</p>;
  }

  const formLabel = (s: string) => t.form(s.split('').map((c) => (c === 'W' ? all.dir.outcomeW : c === 'L' ? all.dir.outcomeL : all.dir.outcomeD)).join(', '));

  const recordCards: { label: string; value: string; who: Rec; sub?: string }[] = [
    { label: t.highest, value: records.highest_elo ? String(records.highest_elo.value) : '—', who: records.highest_elo },
    { label: t.streak, value: records.longest_streak ? t.streakValue(records.longest_streak.value) : '—', who: records.longest_streak },
    { label: t.upset, value: records.biggest_upset ? t.upsetValue(records.biggest_upset.value) : '—', who: records.biggest_upset,
      sub: records.biggest_upset?.beaten ? t.beat(records.biggest_upset.beaten) : undefined },
    { label: t.most, value: records.most_battles ? String(records.most_battles.value) : '—', who: records.most_battles },
    { label: t.winRate, value: records.best_win_rate ? `${records.best_win_rate.value}%` : '—', who: records.best_win_rate,
      sub: records.best_win_rate?.battles ? t.winRateBattles(records.best_win_rate.battles) : undefined },
  ];

  const row = (r: BoardRow) => {
    const elite = r.rank <= ELITE;
    const first = r.rank === 1;
    return (
      <li key={r.profile_id}>
        <Link href={`/beatboxers/${r.username}`} aria-label={t.open(r.username)}
          className={`grid grid-cols-[2.5rem_auto_1fr_auto] items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors sm:grid-cols-[3rem_auto_1fr_auto_auto_auto_auto] [&>*:nth-child(5)]:justify-self-end sm:gap-4 sm:px-4
            ${first ? 'border-gold/40 bg-gradient-to-r from-gold/12 to-surface shadow-[inset_3px_0_0_var(--gold)]'
              : elite ? 'border-line bg-surface shadow-[inset_3px_0_0_var(--sub)] hover:border-sub/50'
              : 'border-line bg-surface hover:border-muted'}`}>
          <span className={`num text-center ${r.rank <= 3 ? 'text-2xl' : 'text-lg text-muted'}`}>{r.rank <= 3 ? MEDAL[r.rank] : `#${r.rank}`}</span>
          <Avatar username={r.username} url={r.avatar_url} size="md" ring={first ? 'gold' : elite ? 'elite' : 'muted'} />
          <span className="grid min-w-0">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-bold">{r.username}</span>
              {r.featured_badge && <BadgeChip code={r.featured_badge} compact />}
            </span>
            <span className="flex gap-2 font-mono text-[0.7rem] text-muted">
              {r.country && <span>{r.country}</span>}
              {r.upsets > 0 && <span className="text-gold">{t.upsets(r.upsets)}</span>}
            </span>
          </span>
          <Form last5={r.last5} label={formLabel(r.last5)} />
          <Spark values={r.spark} label={t.spark} />
          <span className="grid w-[7.5rem] justify-items-end text-right">
            <span className={`num text-xl font-bold ${first ? 'text-gold' : ''}`}>{r.elo}</span>
            <span className="font-mono text-[0.7rem] text-muted">
              {r.last_delta != null && r.last_delta !== 0 && (
                <span className={r.last_delta > 0 ? 'text-win' : 'text-loss'}>{r.last_delta > 0 ? '+' : '−'}{Math.abs(r.last_delta)}</span>
              )}
              {r.peak > r.elo && <span> {t.peak(r.peak)}</span>}
            </span>
          </span>
          <span className="hidden w-20 text-right font-mono text-sm text-muted sm:block">{t.wl(r.wins, r.battles)}</span>
        </Link>
      </li>
    );
  };

  const sectionTitle = (text: string, color: string, icon: string) => (
    <h2 className={`flex items-center gap-3 font-mono text-xs font-semibold tracking-[0.2em] uppercase ${color}`}>
      <span aria-hidden="true">{icon}</span>{text}
      <span className="h-px flex-1 bg-gradient-to-r from-current to-transparent opacity-40" aria-hidden="true" />
    </h2>
  );

  return (
    <div className="grid gap-12">
      <p className="text-sm text-muted">{t.note}</p>

      <Podium rows={board.slice(0, 3)} />

      {onFire.length > 0 && (
        <section className="grid gap-3">
          <h2 className="flex items-baseline gap-3 text-lg font-bold">
            <span aria-hidden="true">🔥</span>{t.onFire} <span className="label">{t.last5}</span>
          </h2>
          <ul className="flex flex-wrap gap-2">
            {onFire.map((f) => (
              <li key={f.profile_id}>
                <Link href={`/beatboxers/${f.username}`} className="flex items-center gap-2 rounded-full border border-win/30 bg-win/10 py-1 pr-4 pl-1 hover:border-win/60">
                  <Avatar username={f.username} url={f.avatar_url} size="sm" />
                  <span className="font-semibold">{f.username}</span>
                  <span className="num text-sm text-win">+{f.gain}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-3">
        <h2 className="flex items-center gap-3 text-lg font-bold"><span aria-hidden="true">👑</span>{t.records}</h2>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {recordCards.map((c) => (
            <li key={c.label} className="grid content-start gap-2 rounded-2xl border border-line bg-gradient-to-b from-surface-2 to-surface p-4">
              <span className="label">{c.label}</span>
              <span className="num text-2xl font-bold text-gold">{c.value}</span>
              {c.who && (
                <Link href={`/beatboxers/${c.who.username}`} className="flex min-w-0 items-center gap-2 hover:underline">
                  <Avatar username={c.who.username} url={c.who.avatar_url} size="xs" />
                  <span className="truncate text-sm font-semibold">{c.who.username}</span>
                </Link>
              )}
              {c.sub && <span className="text-xs text-muted">{c.sub}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3">
        {sectionTitle(t.elite, 'text-sub', '◆')}
        <ol className="grid gap-2">{board.filter((r) => r.rank <= ELITE).map(row)}</ol>
      </section>

      {board.some((r) => r.rank > ELITE) && (
        <section className="grid gap-3">
          {sectionTitle(t.rest, 'text-muted', '·')}
          <ol className="grid gap-2">{board.filter((r) => r.rank > ELITE).map(row)}</ol>
        </section>
      )}
    </div>
  );
}
