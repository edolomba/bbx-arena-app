'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createLocalAudioTrack, DisconnectReason, RoomEvent, Track,
  type LocalAudioTrack, type Participant, type Room, type TrackPublishOptions,
} from 'livekit-client';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/components/i18n/I18nProvider';

export type RoomRole = 'host' | 'judge' | 'battler' | 'speaker' | 'audience' | 'banned';
const TALKERS = ['host', 'judge', 'battler', 'speaker'];
const ORDER: Record<string, number> = { host: 0, battler: 1, judge: 2, speaker: 3, audience: 4 };

interface Props {
  room: Room | null;
  role: RoomRole;
  kind: 'battle' | 'event';
  roomId: string;
  /** A round is counting down, running, or just ending: everyone but the performer is silent. */
  roundActive: boolean;
  /** It's my own round right now: the stage controls my mic, not this panel. */
  myRoundLive: boolean;
  /** Battlers: the raw (unprocessed) mic already published by the stage. Others talk through a voice-filtered mic. */
  performerMic: LocalAudioTrack | null;
  publishOptions: TrackPublishOptions;
}

/**
 * Voice-channel behaviour for live rooms: talkers have their own mute button,
 * every mic except the performer's is silenced while a round runs (and comes
 * back as it was), and the host can mute, invite, remove and ban people.
 */
export default function VoiceControls({ room, role, kind, roomId, roundActive, myRoundLive, performerMic, publishOptions }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const t = useI18n().t.voice;
  const [, bump] = useState(0);
  const refresh = useCallback(() => bump((n) => n + 1), []);
  const [wanted, setWanted] = useState(false);
  const [talkTrack, setTalkTrack] = useState<LocalAudioTrack | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [banned, setBanned] = useState<{ profile_id: string; username: string }[]>([]);
  const creating = useRef(false);
  const isHost = role === 'host';

  const mic = performerMic ?? talkTrack;
  const canPublish = !!room?.localParticipant.permissions?.canPublish;

  // Keep the list fresh: joins, leaves, speaking, mute changes, invitations.
  useEffect(() => {
    if (!room) return;
    const onDisconnected = (reason?: DisconnectReason) => {
      if (reason === DisconnectReason.PARTICIPANT_REMOVED) setNotice(t.removed);
      refresh();
    };
    const onMuted = (pub: { track?: unknown }, p: Participant) => {
      if (p.identity === room.localParticipant.identity && !roundActive && wanted) {
        setWanted(false);
        setNotice(t.hostMuted);
      }
      void pub;
      refresh();
    };
    const onPermissions = () => {
      if (!room.localParticipant.permissions?.canPublish) {
        setTalkTrack(null);
        setWanted(false);
      }
      refresh();
    };
    room
      .on(RoomEvent.ParticipantConnected, refresh)
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.ActiveSpeakersChanged, refresh)
      .on(RoomEvent.TrackMuted, onMuted)
      .on(RoomEvent.TrackUnmuted, refresh)
      .on(RoomEvent.TrackPublished, refresh)
      .on(RoomEvent.TrackUnpublished, refresh)
      .on(RoomEvent.ParticipantAttributesChanged, refresh)
      .on(RoomEvent.ParticipantPermissionsChanged, onPermissions)
      .on(RoomEvent.Disconnected, onDisconnected);
    return () => {
      room
        .off(RoomEvent.ParticipantConnected, refresh)
        .off(RoomEvent.ParticipantDisconnected, refresh)
        .off(RoomEvent.ActiveSpeakersChanged, refresh)
        .off(RoomEvent.TrackMuted, onMuted)
        .off(RoomEvent.TrackUnmuted, refresh)
        .off(RoomEvent.TrackPublished, refresh)
        .off(RoomEvent.TrackUnpublished, refresh)
        .off(RoomEvent.ParticipantAttributesChanged, refresh)
        .off(RoomEvent.ParticipantPermissionsChanged, onPermissions)
        .off(RoomEvent.Disconnected, onDisconnected);
    };
  }, [room, refresh, roundActive, wanted, t]);

  // The rule: my own round belongs to the stage; any round mutes me; otherwise my button decides.
  useEffect(() => {
    if (!mic || myRoundLive) return;
    if (roundActive || !wanted) void mic.mute();
    else void mic.unmute();
  }, [mic, roundActive, myRoundLive, wanted]);

  // Stop the voice mic when leaving.
  useEffect(() => () => { talkTrack?.stop(); }, [talkTrack]);

  async function toggle() {
    setNotice(null);
    if (!room || roundActive) return;
    if (!mic) {
      if (!canPublish || creating.current) return;
      creating.current = true;
      try {
        // Talking (not performing): voice filters on, like a voice channel, so speakers don't echo.
        const track = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
        await room.localParticipant.publishTrack(track, { source: Track.Source.Microphone, ...publishOptions });
        setTalkTrack(track);
        setWanted(true);
      } catch {
        setNotice(t.failed);
      } finally {
        creating.current = false;
      }
      return;
    }
    setWanted((w) => !w);
  }

  const loadBanned = useCallback(async () => {
    if (!isHost) return;
    const { data } = await supabase.from('room_roles').select('profile_id, profile:profiles!room_roles_profile_id_fkey(username)')
      .eq('room_kind', kind).eq('room_id', roomId).eq('role', 'banned');
    setBanned(((data ?? []) as unknown as { profile_id: string; profile: { username: string } | null }[])
      .map((r) => ({ profile_id: r.profile_id, username: r.profile?.username ?? '?' })));
  }, [isHost, supabase, kind, roomId]);
  useEffect(() => { void loadBanned(); }, [loadBanned]);

  async function moderate(action: 'mute' | 'kick' | 'ban' | 'unban' | 'invite' | 'uninvite', identity: string, name: string) {
    if (action === 'ban' && !window.confirm(t.confirmBan(name))) return;
    setBusy(identity + action);
    setNotice(null);
    const res = await fetch('/api/livekit/moderate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, id: roomId, action, identity }),
    });
    setBusy(null);
    if (!res.ok) setNotice((await res.json().catch(() => ({}))).error ?? t.failed);
    if (action === 'ban' || action === 'unban') void loadBanned();
    refresh();
  }

  if (!room) return null;
  const people = [room.localParticipant as Participant, ...room.remoteParticipants.values()];
  const roleOf = (p: Participant) => (p.attributes?.role as string) || 'audience';
  const talkers = people.filter((p) => TALKERS.includes(roleOf(p))).sort((a, b) => ORDER[roleOf(a)] - ORDER[roleOf(b)]);
  const audience = people.filter((p) => !TALKERS.includes(roleOf(p)));
  const nameOf = (p: Participant) => p.name || t.guest;
  const me = room.localParticipant.identity;
  const talking = !!mic && !mic.isMuted;

  const row = (p: Participant) => {
    const r = roleOf(p);
    const speaking = p.isSpeaking && p.isMicrophoneEnabled;
    const isMe = p.identity === me;
    const canBan = !['host', 'judge', 'battler'].includes(r) && /^[0-9a-f-]{36}$/i.test(p.identity);
    return (
      <li key={p.identity} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
        <span className={`grid size-8 shrink-0 place-items-center rounded-full border-2 text-xs font-bold transition-colors ${speaking ? 'border-win bg-win/15 shadow-[0_0_12px_-2px_var(--win)]' : 'border-line bg-surface-2'}`} aria-hidden="true">
          {nameOf(p).replace('@', '').slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold">{nameOf(p)}</span>
          <span className="ml-2 font-mono text-[0.65rem] tracking-widest text-muted uppercase">{t.roles[r] ?? r}</span>
        </span>
        {TALKERS.includes(r) && <span className={p.isMicrophoneEnabled ? 'text-win' : 'text-muted'} aria-label={p.isMicrophoneEnabled ? t.micOn : t.micOff}>{p.isMicrophoneEnabled ? '🎙️' : '🔇'}</span>}
        {isHost && !isMe && (
          <span className="flex flex-wrap gap-1 text-xs">
            {p.isMicrophoneEnabled && <button disabled={!!busy} onClick={() => moderate('mute', p.identity, nameOf(p))} className="rounded-full border border-line px-2 py-0.5">{t.mute}</button>}
            {r === 'audience' && /^[0-9a-f-]{36}$/i.test(p.identity) && <button disabled={!!busy} onClick={() => moderate('invite', p.identity, nameOf(p))} className="rounded-full border border-gold/50 px-2 py-0.5 text-gold">{t.invite}</button>}
            {r === 'speaker' && <button disabled={!!busy} onClick={() => moderate('uninvite', p.identity, nameOf(p))} className="rounded-full border border-line px-2 py-0.5">{t.uninvite}</button>}
            <button disabled={!!busy} onClick={() => moderate('kick', p.identity, nameOf(p))} className="rounded-full border border-line px-2 py-0.5">{t.kick}</button>
            {canBan && <button disabled={!!busy} onClick={() => moderate('ban', p.identity, nameOf(p))} className="rounded-full border border-loss/50 px-2 py-0.5 text-loss">{t.ban}</button>}
          </span>
        )}
      </li>
    );
  };

  return (
    <section className="grid gap-4 rounded-2xl border border-line bg-surface p-5" aria-label={t.inRoom}>
      {(mic || canPublish) && (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={toggle} disabled={roundActive && !myRoundLive}
              className={`rounded-full px-5 py-2.5 font-semibold disabled:opacity-60 ${myRoundLive ? 'bg-sub text-paper' : talking ? 'bg-win text-paper' : 'border border-line'}`}>
              {myRoundLive ? '🎤' : roundActive ? `🔇 ${t.micLocked}` : talking ? `🎙️ ${t.micOn}` : `🔇 ${t.micOff}`}
            </button>
            <span className="text-sm text-muted">{t.talkHint}</span>
          </div>
          <p className="text-xs text-muted">🎧 {t.headphones}</p>
        </div>
      )}
      {notice && <p role="status" className="text-sm text-loss">{notice}</p>}

      <div className="grid gap-1">
        <p className="label">{t.inRoom}</p>
        <ul className="divide-y divide-line">{talkers.map(row)}</ul>
        {audience.length > 0 && (isHost ? (
          <details className="mt-1">
            <summary className="cursor-pointer text-sm text-muted">{t.listeners(audience.length)}</summary>
            <ul className="divide-y divide-line">{audience.map(row)}</ul>
          </details>
        ) : <p className="text-sm text-muted">{t.listeners(audience.length)}</p>)}
      </div>

      {isHost && banned.length > 0 && (
        <div className="grid gap-1">
          <p className="label">{t.banned}</p>
          <ul className="flex flex-wrap gap-2">
            {banned.map((b) => (
              <li key={b.profile_id} className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-sm">
                @{b.username}
                <button disabled={!!busy} onClick={() => moderate('unban', b.profile_id, b.username)} className="text-xs text-gold underline underline-offset-2">{t.unban}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
