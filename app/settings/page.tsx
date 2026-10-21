import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ProfileForm from '@/components/settings/ProfileForm';
import DeleteAccount from '@/components/settings/DeleteAccount';
import { getT } from '@/lib/i18n/server';
import AvatarUpload from '@/components/settings/AvatarUpload';
import PushToggle from '@/components/push/PushToggle';

export default async function SettingsPage() {
  const { t } = await getT();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/settings');
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, full_name, country, bio, social_links, avatar_url')
    .eq('id', user.id)
    .single();
  if (!profile) redirect('/');
  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6">
      <div className="grid gap-2">
        <h1 className="handle text-[clamp(2.2rem,6vw,3.6rem)] leading-none">{t.settings.title}</h1>
        <p className="text-muted">{t.settings.lead(profile.username)}</p>
      </div>
      <AvatarUpload userId={profile.id} username={profile.username} initialUrl={profile.avatar_url ?? null} />
      <PushToggle />
      <ProfileForm initial={profile} />
      <DeleteAccount username={profile.username} />
    </main>
  );
}
