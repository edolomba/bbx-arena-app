import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ProfileForm from '@/components/settings/ProfileForm';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/settings');
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, full_name, country, bio, social_links')
    .eq('id', user.id)
    .single();
  if (!profile) redirect('/');
  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6">
      <div className="grid gap-2">
        <h1 className="handle text-[clamp(2.2rem,6vw,3.6rem)] leading-none">Your profile</h1>
        <p className="text-muted">@{profile.username}. Everything here is public.</p>
      </div>
      <ProfileForm initial={profile} />
    </main>
  );
}
