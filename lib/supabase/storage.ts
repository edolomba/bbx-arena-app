export const AUDIO_BUCKET = 'battle-audio';

/** Public URL for an object in the audio bucket. Pure, so it works on server and client. */
export function audioUrl(path: string): string {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${AUDIO_BUCKET}/${encoded}`;
}
