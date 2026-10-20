import type { SupabaseClient } from '@supabase/supabase-js';
import type { PreparedTake } from '@/lib/types';
import { AUDIO_BUCKET } from './storage';

export async function eventRpc(supabase: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

/** Upload a showcase (write-once file) and register it with the event. */
export async function submitShowcase(supabase: SupabaseClient, eventId: string, userId: string, take: PreparedTake) {
  const path = `event-${eventId}/${userId}/${crypto.randomUUID()}.${take.fileExt}`;
  const { error: up } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(path, take.blob, { contentType: take.contentType, upsert: false, cacheControl: '31536000' });
  if (up) throw new Error(`The upload didn’t finish: ${up.message}`);
  const a = take.analysis;
  await eventRpc(supabase, 'submit_showcase', {
    p_event: eventId,
    p_audio_path: path,
    p_duration_ms: a.durationMs,
    p_waveform: a.waveform,
    p_lufs: a.integratedLufs,
    p_peak_dbfs: Number.isFinite(a.peakDbfs) ? a.peakDbfs : null,
    p_sub_ratio: a.subRatio,
  });
}

export const EVENT_STATUS_LABEL: Record<string, string> = {
  registration: 'Registration open',
  eliminations: 'Eliminations',
  judging: 'Judges ranking',
  main: 'Main stage',
  finished: 'Finished',
  cancelled: 'Cancelled',
};
