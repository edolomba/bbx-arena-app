import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import CreateEventForm from '@/components/events/CreateEventForm';
import EventLogo from '@/components/events/EventLogo';

export default async function NewCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/events/g/${id}/categories/new`);
  const { data: g } = await supabase.from('event_groups').select('id, host_id, name, edition, logo_url').eq('id', id).maybeSingle();
  if (!g) notFound();
  if (g.host_id !== user.id) redirect(`/events/g/${id}`);
  const { t } = await getT();
  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6">
      <Link href={`/events/g/${id}`} className="flex items-center gap-3 text-muted hover:text-ink">
        <EventLogo name={g.name} url={g.logo_url} size="sm" />
        <span>{g.name}{g.edition ? ` ${g.edition}` : ''}</span>
      </Link>
      <h1 className="handle text-[clamp(2rem,5vw,3rem)] leading-none">{t.evg.newCategory}</h1>
      <CreateEventForm groupId={id} />
    </main>
  );
}
