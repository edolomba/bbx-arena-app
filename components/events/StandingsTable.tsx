import Link from 'next/link';
import type { StandingRow } from '@/lib/types';

/**
 * Official classification, shown the way it's calculated: every judge's
 * position, the best and the worst struck through, and the sum of the rest.
 */
export default function StandingsTable({ rows, names, advanceCount }: {
  rows: StandingRow[]; names: Record<string, string>; advanceCount: number;
}) {
  // Note which rule separated a row from the one above it, when the score was equal.
  const decidedBy = (r: StandingRow, prev?: StandingRow) => {
    if (!prev || prev.trimmed !== r.trimmed) return '';
    if (prev.h2h !== r.h2h) return 'head-to-head';
    if (prev.full_sum !== r.full_sum) return 'all positions';
    if (prev.firsts !== r.firsts) return 'first places';
    return r.tied ? 'still tied' : 'host’s decision';
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse">
        <thead>
          <tr className="border-b-2 border-ink text-left text-xs text-muted">
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Place</th>
            <th scope="col" className="py-2 pr-3 font-semibold">Beatboxer</th>
            <th scope="col" className="py-2 pr-3 font-semibold">Judges’ positions</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Score</th>
            <th scope="col" className="py-2 font-semibold">Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const qualified = r.place <= advanceCount;
            const note = decidedBy(r, rows[i - 1]);
            return (
              <tr key={r.profile_id} className={`border-b ${i + 1 === advanceCount ? 'border-b-2 border-sub' : 'border-line'}`}>
                <td className={`num py-2.5 pr-3 text-right text-xl ${qualified ? '' : 'text-muted'}`}>{r.place}</td>
                <td className="py-2.5 pr-3">
                  <Link href={`/beatboxers/${names[r.profile_id]}`} className="underline-offset-4 hover:underline">@{names[r.profile_id]}</Link>
                  {qualified && <span className="ml-2 rounded-full bg-win px-2 py-0.5 text-xs text-paper">Qualified</span>}
                </td>
                <td className="num py-2.5 pr-3 whitespace-nowrap">
                  {r.positions.map((p, k) => {
                    const struck = k === 0 || k === r.positions.length - 1;
                    return (
                      <span key={k} className={`mr-2 ${struck ? 'text-muted line-through' : ''}`}>{p}</span>
                    );
                  })}
                </td>
                <td className="num py-2.5 pr-3 text-right text-xl">{r.trimmed}</td>
                <td className={`py-2.5 text-sm ${r.tied ? 'text-loss' : 'text-muted'}`}>{note}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-sm text-muted">
        For each beatboxer the best and the worst position are dropped and the rest are added up; lowest wins.
        Ties go to head-to-head, then all positions, then first places, then the host.
      </p>
    </div>
  );
}
