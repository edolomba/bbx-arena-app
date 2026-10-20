import { NextResponse } from 'next/server';
import { AccessToken, TrackSource } from 'livekit-server-sdk';
import { createClient } from '@/lib/supabase/server';

/**
 * Room tickets for stage battles. The two battlers may publish their
 * microphone; everyone else, logged in or not, can only listen.
 */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) {
    return NextResponse.json({ error: 'The live audio service isn’t set up yet.' }, { status: 500 });
  }

  const { battleId } = (await request.json().catch(() => ({}))) as { battleId?: string };
  if (!battleId) return NextResponse.json({ error: 'Missing battle.' }, { status: 400 });

  const supabase = await createClient();
  const [{ data: { user } }, { data: b }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('battles').select('id, mode, status, starts_at, challenger_id, opponent_id').eq('id', battleId).maybeSingle(),
  ]);
  if (!b || b.mode !== 'stage') return NextResponse.json({ error: 'This isn’t a stage battle.' }, { status: 404 });
  if (b.status !== 'active' && b.status !== 'live') {
    return NextResponse.json({ error: 'This stage is closed.' }, { status: 409 });
  }
  if (Date.now() < new Date(b.starts_at).getTime() - 30 * 60_000) {
    return NextResponse.json({ error: 'The room opens 30 minutes before the start.' }, { status: 409 });
  }

  const performer = !!user && (user.id === b.challenger_id || user.id === b.opponent_id);
  let name = 'Guest';
  if (user) {
    const { data: p } = await supabase.from('profiles').select('username').eq('id', user.id).maybeSingle();
    if (p?.username) name = `@${p.username}`;
  }

  const token = new AccessToken(key, secret, {
    identity: user?.id ?? `guest-${crypto.randomUUID()}`,
    name,
    ttl: '3h',
  });
  token.addGrant({
    room: `stage-${b.id}`,
    roomJoin: true,
    canSubscribe: true,
    canPublish: performer,
    canPublishData: false,
    canPublishSources: performer ? [TrackSource.MICROPHONE] : [],
  });

  return NextResponse.json({ token: await token.toJwt(), url, role: performer ? 'performer' : 'audience' });
}
