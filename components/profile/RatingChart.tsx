import { formatDate } from '@/lib/format';
import type { ProfileBattle } from '@/lib/types';

/** Rating after every battle, starting from 1200. Pure SVG, server-rendered. */
export default function RatingChart({ games, peak, current }: { games: ProfileBattle[]; peak: number; current: number }) {
  const rated = games.filter((g) => g.elo_after != null);
  if (rated.length < 2) return null;
  const vals = [1200, ...rated.map((g) => g.elo_after as number)];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = Math.max(12, (max - min) * 0.08);
  const lo = min - pad;
  const hi = max + pad;
  const W = 600;
  const H = 160;
  const x = (i: number) => (i / (vals.length - 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');

  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      <div className="num flex flex-col justify-between text-right text-xs text-muted" aria-hidden="true">
        <span>{max}</span>
        <span>{min}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={`Rating went from 1200 to ${current} over ${rated.length} battles, peaking at ${peak}`}
        className="block h-44 w-full border-b border-line">
        <path d={`${line}L${W},${H}L0,${H}Z`} className="fill-signal/10" />
        <line x1="0" x2={W} y1={y(peak)} y2={y(peak)} vectorEffect="non-scaling-stroke" className="stroke-muted" strokeDasharray="4 4" />
        <path d={line} vectorEffect="non-scaling-stroke" className="fill-none stroke-signal" strokeWidth={2} strokeLinejoin="round" />
      </svg>
      <div className="col-start-2 flex justify-between text-xs text-muted" aria-hidden="true">
        <span>{formatDate(rated[0].finished_at)}</span>
        <span>Latest battle</span>
      </div>
    </div>
  );
}
