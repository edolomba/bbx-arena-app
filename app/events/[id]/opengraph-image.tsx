import { OG_SIZE, ogClient } from '@/lib/og/assets';
import { eventImage } from '@/lib/og/event';

export const runtime = 'nodejs';
export const alt = 'Beatbox event on Beatbox Arena';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: c } = /^[0-9a-f-]{36}$/i.test(id)
    ? await ogClient().from('events').select('group_id, category_name').eq('id', id).maybeSingle()
    : { data: null };
  return eventImage(c?.group_id ?? null, c?.category_name ?? null);
}
