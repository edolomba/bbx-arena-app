import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import CreateEventForm from '@/components/events/CreateEventForm';

export const metadata = { title: 'Create an event' };

export default async function NewEventPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/events/new');
  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6">
      <div className="grid gap-2">
        <h1 className="handle text-[clamp(2.2rem,6vw,3.6rem)] leading-none">Create an event</h1>
        <p className="max-w-[60ch] text-muted">A GBB-style tournament: live eliminations, judges rank the showcases, then the top beatboxers battle. You host it, and it can run over several days.</p>
      </div>
      <CreateEventForm />
    </main>
  );
}
