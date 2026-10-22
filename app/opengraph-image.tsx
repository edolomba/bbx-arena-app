import { ImageResponse } from 'next/og';
import { OG_SIZE, ogFonts } from '@/lib/og/assets';
import { SiteCard } from '@/lib/og/cards';

export const runtime = 'nodejs';
export const alt = 'Beatbox Arena: 1v1 beatbox battles. Every sound intact.';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(<SiteCard />, { ...OG_SIZE, fonts: await ogFonts() });
}
