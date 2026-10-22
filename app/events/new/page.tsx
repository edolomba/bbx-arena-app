import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import EventGroupForm from '@/components/events/EventGroupForm';

export const metadata = { title: 'Create an event' };

export default async function NewEventPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/events/new');
  const { t } = await getT();
  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6">
      <div className="grid gap-2">
        <h1 className="handle text-[clamp(2.2rem,6vw,3.6rem)] leading-none">{t.evg.create}</h1>
        <p className="max-w-[62ch] text-muted">{t.evg.createLead}</p>
      </div>
      <EventGroupForm userId={user.id} />
    </main>
  );
}
