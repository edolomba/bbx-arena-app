import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import EventGroupForm from '@/components/events/EventGroupForm';
import ScheduleEditor from '@/components/events/ScheduleEditor';
import type { EventGroup, EventRow, EventSession } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/events/g/${id}/edit`);
  const [{ data: g }, { data: cats }, { data: sessions }] = await Promise.all([
    supabase.from('event_groups').select('*').eq('id', id).maybeSingle(),
    supabase.from('events').select('id, title, category_name').eq('group_id', id).order('created_at'),
    supabase.from('event_sessions').select('*').eq('group_id', id).order('starts_at'),
  ]);
  if (!g) notFound();
  if (g.host_id !== user.id) redirect(`/events/g/${id}`);
  const { t } = await getT();
  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="handle text-[clamp(2rem,5vw,3rem)] leading-none">{t.evg.edit}</h1>
        <Link href={`/events/g/${id}`} className="text-muted underline underline-offset-4">← {t.evg.backToEvent}</Link>
      </div>
      <EventGroupForm userId={user.id} group={g as EventGroup} />
      <ScheduleEditor groupId={id} sessions={(sessions ?? []) as EventSession[]} defaultStart={(g as EventGroup).starts_at}
        categories={((cats ?? []) as EventRow[]).map((c) => ({ id: c.id, name: c.category_name ?? c.title }))} />
      <section className="grid gap-3">
        <h2 className="text-xl font-bold [font-stretch:112%]">{t.evg.categories}</h2>
        <ul className="flex flex-wrap gap-2">
          {((cats ?? []) as EventRow[]).map((c) => (
            <li key={c.id}><Link href={`/events/${c.id}`} className="rounded-full border border-line px-4 py-2 text-sm hover:border-muted">{c.category_name ?? c.title} · {t.evg.manage}</Link></li>
          ))}
          <li><Link href={`/events/g/${id}/categories/new`} className="rounded-full bg-ink px-4 py-2 text-sm text-paper">+ {t.evg.addCategory}</Link></li>
        </ul>
      </section>
    </main>
  );
}
