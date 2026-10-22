import { NextResponse } from 'next/server';
import { TrackSource, TrackType } from 'livekit-server-sdk';
import { createClient } from '@/lib/supabase/server';
import { roomName, roomService, type RoomKind } from '@/lib/livekit/server';

type Action = 'mute' | 'kick' | 'ban' | 'unban' | 'invite' | 'uninvite';
const ACTIONS: Action[] = ['mute', 'kick', 'ban', 'unban', 'invite', 'uninvite'];

/** Host moderation for live rooms. Every action is checked against the database first. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { kind?: RoomKind; id?: string; action?: Action; identity?: string };
  const { kind, id, action, identity } = body;
  if (!kind || !['battle', 'event'].includes(kind) || !id || !action || !ACTIONS.includes(action) || !identity) {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Log in first.' }, { status: 401 });
  if (identity === user.id) return NextResponse.json({ error: 'That’s you.' }, { status: 400 });

  const { data: role } = await supabase.rpc('room_access', { p_kind: kind, p_room: id });
  if (role !== 'host') return NextResponse.json({ error: 'Only the host can do that.' }, { status: 403 });

  const isProfile = /^[0-9a-f-]{36}$/i.test(identity);
  if (['ban', 'unban', 'invite', 'uninvite'].includes(action)) {
    if (!isProfile) return NextResponse.json({ error: 'Guests can only be removed.' }, { status: 400 });
    const next = action === 'ban' ? 'banned' : action === 'invite' ? 'speaker' : null;
    const { error } = await supabase.rpc('set_room_role', { p_kind: kind, p_room: id, p_profile: identity, p_role: next });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const room = roomName(kind, id);
  try {
    const svc = roomService();
    if (action === 'mute') {
      const p = await svc.getParticipant(room, identity);
      await Promise.all(p.tracks.filter((t) => t.type === TrackType.AUDIO && !t.muted).map((t) => svc.mutePublishedTrack(room, identity, t.sid, true)));
    } else if (action === 'kick' || action === 'ban') {
      await svc.removeParticipant(room, identity);
    } else if (action === 'invite') {
      await svc.updateParticipant(room, identity, {
        attributes: { role: 'speaker' },
        permission: { canSubscribe: true, canPublish: true, canPublishData: false, canPublishSources: [TrackSource.MICROPHONE] },
      });
    } else if (action === 'uninvite') {
      await svc.updateParticipant(room, identity, {
        attributes: { role: 'audience' },
        permission: { canSubscribe: true, canPublish: false, canPublishData: false, canPublishSources: [] },
      });
    }
  } catch {
    // Not in the room right now: the database change (ban, invite) still applies when they join.
  }
  return NextResponse.json({ ok: true });
}
