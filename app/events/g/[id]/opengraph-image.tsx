import { OG_SIZE } from '@/lib/og/assets';
import { eventImage } from '@/lib/og/event';

export const runtime = 'nodejs';
export const alt = 'Beatbox event on Beatbox Arena';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return eventImage(/^[0-9a-f-]{36}$/i.test(id) ? id : null);
}
