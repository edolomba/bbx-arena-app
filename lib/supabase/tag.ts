import type { SupabaseClient } from '@supabase/supabase-js';
import { AUDIO_BUCKET } from './storage';
import type { PreparedTake } from '@/lib/types';

/** First layer of a team round: upload, then register it. */
export async function submitTagPart(supabase: SupabaseClient, battleId: string, userId: string, take: PreparedTake) {
  const path = `${battleId}/${userId}/${crypto.randomUUID()}.${take.fileExt}`;
  const { error: up } = await supabase.storage.from(AUDIO_BUCKET).upload(path, take.blob, { contentType: take.contentType, upsert: false, cacheControl: '31536000' });
  if (up) throw new Error(`The upload didn’t finish: ${up.message}. Try again.`);
  const { error } = await supabase.rpc('submit_tag_part', { p_battle: battleId, p_audio_path: path, p_duration_ms: take.analysis.durationMs, p_waveform: take.analysis.waveform });
  if (error) throw new Error(error.message);
}

export async function rpcOrThrow(supabase: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}
