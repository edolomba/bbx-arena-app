import { NextResponse } from 'next/server';
import { canTalk, type RoomRole } from '@/lib/livekit/server';
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

  const { battleId, eventId, micTest } = (await request.json().catch(() => ({}))) as {
    battleId?: string; eventId?: string; micTest?: 'send' | 'listen';
  };
  if (!battleId && !eventId && !micTest) return NextResponse.json({ error: 'Missing battle.' }, { status: 400 });

  const supabase = await createClient();

  // Mic check: a private room where your own browser sends and listens back,
  // over the same server and settings as a real stage.
  if (micTest) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Log in to test your live connection.' }, { status: 401 });
    const token = new AccessToken(key, secret, { identity: `${user.id}:${micTest}`, name: micTest, ttl: '15m' });
    token.addGrant({
      room: `mictest-${user.id}`, roomJoin: true, canSubscribe: true, canPublish: micTest === 'send', canPublishData: false,
      canPublishSources: micTest === 'send' ? [TrackSource.MICROPHONE] : [],
    });
    return NextResponse.json({ token: await token.toJwt(), url });
  }

  // Event rooms: every registered beatboxer may publish (they're only audible when called).
  if (eventId) {
    const [{ data: { user } }, { data: ev }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('events').select('id, status, live').eq('id', eventId).maybeSingle(),
    ]);
    if (!ev || !['eliminations', 'main'].includes(ev.status)) {
      return NextResponse.json({ error: 'This event has no live part right now.' }, { status: 409 });
    }
    let role: RoomRole = 'audience';
    let name = 'Guest';
    if (user) {
      const [{ data: r }, { data: p }] = await Promise.all([
        supabase.rpc('room_access', { p_kind: 'event', p_room: ev.id }),
        supabase.from('profiles').select('username').eq('id', user.id).maybeSingle(),
      ]);
      role = (r as RoomRole) ?? 'audience';
      if (p?.username) name = `@${p.username}`;
    }
    if (role === 'banned') return NextResponse.json({ error: 'The host removed you from this room.' }, { status: 403 });
    const performer = canTalk(role);
    const token = new AccessToken(key, secret, { identity: user?.id ?? `guest-${crypto.randomUUID()}`, name, ttl: '6h', attributes: { role } });
    token.addGrant({
      room: `event-${ev.id}`, roomJoin: true, canSubscribe: true, canPublish: performer, canPublishData: false,
      canPublishSources: performer ? [TrackSource.MICROPHONE] : [],
    });
    return NextResponse.json({ token: await token.toJwt(), url, role });
  }
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

  let role: RoomRole = 'audience';
  let name = 'Guest';
  if (user) {
    const [{ data: r }, { data: p }] = await Promise.all([
      supabase.rpc('room_access', { p_kind: 'battle', p_room: b.id }),
      supabase.from('profiles').select('username').eq('id', user.id).maybeSingle(),
    ]);
    role = (r as RoomRole) ?? 'audience';
    if (p?.username) name = `@${p.username}`;
  }
  if (role === 'banned') return NextResponse.json({ error: 'The host removed you from this room.' }, { status: 403 });
  const performer = canTalk(role);

  const token = new AccessToken(key, secret, {
    identity: user?.id ?? `guest-${crypto.randomUUID()}`,
    name,
    ttl: '3h',
    attributes: { role },
  });
  token.addGrant({
    room: `stage-${b.id}`,
    roomJoin: true,
    canSubscribe: true,
    canPublish: performer,
    canPublishData: false,
    canPublishSources: performer ? [TrackSource.MICROPHONE] : [],
  });

  return NextResponse.json({ token: await token.toJwt(), url, role });
}
