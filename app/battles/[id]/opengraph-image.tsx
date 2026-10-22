import { ImageResponse } from 'next/og';
import { OG_SIZE, ogClient, ogFonts, squarePng } from '@/lib/og/assets';
import { BattleCard, SiteCard } from '@/lib/og/cards';

export const runtime = 'nodejs';
export const alt = 'Beatbox battle on Beatbox Arena';
export const size = OG_SIZE;
export const contentType = 'image/png';

type P = { id: string; username: string; avatar_url: string | null; elo_rating: number };

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fonts = await ogFonts();
  const { data: b } = /^[0-9a-f-]{36}$/i.test(id)
    ? await ogClient().from('battles').select('status, mode, result, winner_id, challenger_id, opponent_id, challenger:profiles!battles_challenger_id_fkey(id, username, avatar_url, elo_rating), opponent:profiles!battles_opponent_id_fkey(id, username, avatar_url, elo_rating)').eq('id', id).maybeSingle()
    : { data: null };
  if (!b) return new ImageResponse(<SiteCard />, { ...OG_SIZE, fonts });

  const ch = b.challenger as unknown as P | null, op = b.opponent as unknown as P | null;
  const finished = b.status === 'finished' && !!b.winner_id;
  const [pa, pb] = await Promise.all([squarePng(ch?.avatar_url, 200), squarePng(op?.avatar_url, 200)]);
  const side = (p: P | null, photo: string | null) => p && { name: p.username, elo: p.elo_rating, photo, winner: finished && b.winner_id === p.id, loser: finished && b.winner_id !== p.id };
  const winner = [ch, op].find((p) => p?.id === b.winner_id)?.username;
  const status =
    b.status === 'open' ? 'Open challenge: anyone can take it'
    : b.status === 'pending' ? 'Challenge sent'
    : b.status === 'live' ? (b.mode === 'stage' ? 'Live on stage now' : 'Live now')
    : b.status === 'active' ? (b.mode === 'async' ? 'Battle in progress' : 'Coming up')
    : b.status === 'voting' ? 'Voting is open: listen and vote'
    : b.status === 'finished' ? (b.result === 'draw' ? 'Draw' : winner ? `@${winner} won${b.result === 'forfeit' ? ' by forfeit' : ''}` : 'Finished')
    : 'Battle';
  const mode = b.mode === 'stage' ? 'Stage' : b.mode === 'live' ? 'Live' : '1v1';
  return new ImageResponse(<BattleCard a={side(ch, pa)} b={side(op, pb)} status={status} mode={mode} />, { ...OG_SIZE, fonts });
}
