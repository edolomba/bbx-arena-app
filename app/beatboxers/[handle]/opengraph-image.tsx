import { ImageResponse } from 'next/og';
import { OG_SIZE, ogClient, ogFonts, squarePng } from '@/lib/og/assets';
import { ProfileCard, SiteCard } from '@/lib/og/cards';
import { BADGES } from '@/lib/badges';

export const runtime = 'nodejs';
export const alt = 'Beatboxer on Beatbox Arena';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const fonts = await ogFonts();
  const { data: p } = await ogClient().from('directory_entries')
    .select('username, avatar_url, elo_rating, global_rank, wins, losses, draws, battles_count, country, featured_badge')
    .ilike('username', decodeURIComponent(handle).replace(/[%_]/g, '')).maybeSingle();
  if (!p) return new ImageResponse(<SiteCard />, { ...OG_SIZE, fonts });
  const rated = p.battles_count > 0;
  const country = p.country ? new Intl.DisplayNames(['en'], { type: 'region' }).of(p.country) ?? p.country : null;
  return new ImageResponse(
    <ProfileCard name={p.username} photo={await squarePng(p.avatar_url, 300)} elo={p.elo_rating}
      rank={rated ? p.global_rank : null} elite={rated && p.global_rank <= 10} wins={p.wins} losses={p.losses} draws={p.draws} battles={p.battles_count}
      country={country} badge={p.featured_badge ? BADGES[p.featured_badge]?.name ?? null : null} />,
    { ...OG_SIZE, fonts });
}
