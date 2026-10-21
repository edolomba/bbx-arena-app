import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AUDIO_BUCKET } from '@/lib/supabase/storage';

/**
 * Deletes the signed-in person's account:
 * 1. anonymize_profile(): settles open battles, removes their rounds, blanks the profile
 * 2. deletes their audio files from storage
 * 3. deletes the login itself
 * Opponents keep their battle history, shown against "deleted_…".
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Log in first.' }, { status: 401 });

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const { data: paths, error } = await admin.rpc('anonymize_profile', { p_profile: user.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const files = (paths as string[] | null) ?? [];
  for (let i = 0; i < files.length; i += 500) {
    await admin.storage.from(AUDIO_BUCKET).remove(files.slice(i, i + 500));
  }

  const { data: photos } = await admin.storage.from('avatars').list(user.id);
  if (photos?.length) await admin.storage.from('avatars').remove(photos.map((f) => `${user.id}/${f.name}`));

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  await supabase.auth.signOut();
  if (deleteError) {
    return NextResponse.json(
      { error: 'Your profile and recordings were removed, but the login could not be deleted. Contact the moderators to finish.' },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
