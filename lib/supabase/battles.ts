import type { SupabaseClient } from '@supabase/supabase-js';
import type { PreparedTake, Submission, Vote } from '@/lib/types';
import { AUDIO_BUCKET } from './storage';

/**
 * Upload a take, then register it with submit_round. The bucket is write-once,
 * so the path gets a fresh UUID and upsert stays off.
 */
export async function submitTake(
  supabase: SupabaseClient,
  battleId: string,
  userId: string,
  take: PreparedTake,
): Promise<Submission> {
  const path = `${battleId}/${userId}/${crypto.randomUUID()}.${take.fileExt}`;
  const { error: uploadError } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(path, take.blob, { contentType: take.contentType, upsert: false, cacheControl: '31536000' });
  if (uploadError) throw new Error(`The upload didn’t finish: ${uploadError.message}. Try again.`);

  const a = take.analysis;
  const { data, error } = await supabase.rpc('submit_round', {
    p_battle_id: battleId,
    p_audio_path: path,
    p_source_codec: take.sourceCodec,
    p_is_lossless: take.isLossless,
    p_duration_ms: a.durationMs,
    p_waveform: a.waveform,
    p_channels: take.channels,
    p_sample_rate: take.sampleRate,
    p_bit_depth: take.bitDepth,
    p_lufs: a.integratedLufs,
    p_peak_dbfs: Number.isFinite(a.peakDbfs) ? a.peakDbfs : null,
    p_sub_ratio: a.subRatio,
  });
  if (error) throw new Error(error.message);
  return data as Submission;
}

export async function castVote(supabase: SupabaseClient, battleId: string, votedFor: string): Promise<Vote> {
  const { data, error } = await supabase.rpc('cast_vote', { p_battle_id: battleId, p_voted_for: votedFor });
  if (error) throw new Error(error.message);
  return data as Vote;
}

export async function acceptChallenge(supabase: SupabaseClient, battleId: string, token?: string | null) {
  const { error } = await supabase.rpc('accept_challenge', { p_battle_id: battleId, p_token: token ?? null });
  if (error) throw new Error(error.message);
}

export async function declineChallenge(supabase: SupabaseClient, battleId: string) {
  const { error } = await supabase.rpc('decline_challenge', { p_battle_id: battleId });
  if (error) throw new Error(error.message);
}

/** Moves a battle past any deadline that has already passed. Safe to call anytime. */
export async function advanceBattle(supabase: SupabaseClient, battleId: string) {
  await supabase.rpc('advance_battle', { p_battle_id: battleId });
}

export interface NewBattle {
  opponent: string;
  roundSeconds: number;
  mode: 'async' | 'live';
  votingHours: number;
  startsInMinutes: number | null;
}

export async function createBattle(supabase: SupabaseClient, b: NewBattle): Promise<string> {
  const { data, error } = await supabase.rpc('create_challenge', {
    p_opponent_username: b.opponent.trim() || null,
    p_round_duration: b.roundSeconds,
    p_mode: b.mode,
    p_voting_hours: b.votingHours,
    p_starts_in_minutes: b.mode === 'live' ? b.startsInMinutes : null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}
