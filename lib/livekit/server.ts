import { RoomServiceClient } from 'livekit-server-sdk';

export type RoomKind = 'battle' | 'event';
export type RoomRole = 'host' | 'judge' | 'battler' | 'speaker' | 'audience' | 'banned';

export const roomName = (kind: RoomKind, id: string) => (kind === 'battle' ? `stage-${id}` : `event-${id}`);
export const canTalk = (role: RoomRole) => role === 'host' || role === 'judge' || role === 'battler' || role === 'speaker';

/** Server-side LiveKit client (moderation). The API speaks HTTPS on the same host as the wss URL. */
export function roomService() {
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL, key = process.env.LIVEKIT_API_KEY, secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) throw new Error('LiveKit is not configured.');
  return new RoomServiceClient(url.replace(/^ws/, 'http'), key, secret);
}
