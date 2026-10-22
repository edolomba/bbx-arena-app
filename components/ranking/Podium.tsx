import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import { countryName, flagEmoji, record } from '@/lib/format';
import Avatar from '@/components/Avatar';

const MEDAL = ['', '🥇', '🥈', '🥉'];

export interface PodiumRow { rank: number; profile_id: string; username: string; avatar_url: string | null; country: string | null; elo: number; wins: number; losses: number; draws: number; battles: number }

/** Top three: 2nd, 1st (raised, gold), 3rd. */
export default async function Podium({ rows }: { rows: PodiumRow[] }) {
  const { locale, t: all } = await getT();
  const t = all.board;
  const podium = [rows[1], rows[0], rows[2]].filter(Boolean);
  return (
    <section aria-label={`Top ${podium.length}`} className="grid grid-cols-3 items-end gap-2 sm:gap-4 md:mx-auto md:w-full md:max-w-3xl">
      {podium.map((r) => {
        const first = r.rank === 1;
        return (
          <Link key={r.profile_id} href={`/beatboxers/${r.username}`} aria-label={t.open(r.username)}
            className={`group grid justify-items-center gap-1.5 rounded-2xl border px-2 pt-4 text-center transition-transform hover:-translate-y-1 sm:px-4
              ${first ? 'border-gold/40 bg-gradient-to-b from-gold/20 via-gold/5 to-transparent pb-0 sm:pt-6' : 'border-line bg-gradient-to-b from-sub/12 to-transparent'}`}>
            <span className="text-xl" aria-hidden="true">{MEDAL[r.rank]}</span>
            <Avatar username={r.username} url={r.avatar_url} size={first ? 'podium' : 'podiumSide'} ring={first ? 'gold' : 'elite'} />
            <span className={`mt-1 max-w-full truncate font-bold ${first ? 'text-lg' : ''}`}>{r.username}</span>
            <span className="text-xs text-muted">{flagEmoji(r.country)} {countryName(r.country, locale)}</span>
            <span className={`num font-bold ${first ? 'text-3xl text-gold sm:text-4xl' : 'text-2xl text-sub'}`}>{r.elo}</span>
            <span className="font-mono text-sm text-muted">{record(r.wins, r.losses, r.draws)}</span>
            <span className={`mt-3 h-3 w-[90%] rounded-t-lg ${first ? 'h-10 bg-gradient-to-b from-gold to-gold/0' : 'bg-gradient-to-b from-sub/80 to-sub/0'}`} aria-hidden="true" />
          </Link>
        );
      })}
    </section>
  );
}
