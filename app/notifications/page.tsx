import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { notificationHref, notificationText } from '@/lib/notifications';
import { formatAgo } from '@/lib/format';
import type { AppNotification } from '@/lib/types';

export const metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/notifications');
  const { data } = await supabase
    .from('notifications')
    .select('id, kind, battle_id, event_id, data, created_at, read_at, actor:profiles!notifications_actor_id_fkey(username)')
    .order('created_at', { ascending: false })
    .limit(100);
  const items = (data ?? []) as unknown as AppNotification[];
  await supabase.rpc('mark_notifications_read', { p_ids: null });

  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-10 sm:px-6">
      <h1 className="handle text-[clamp(2.2rem,6vw,3.6rem)] leading-none">Notifications</h1>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-8 text-muted">Nothing yet. Challenges, your turns and results show up here.</p>
      ) : (
        <ul className="grid border-t-2 border-ink">
          {items.map((n) => (
            <li key={n.id} className="border-b border-line">
              <Link href={notificationHref(n)} className="grid gap-0.5 py-3 hover:bg-surface">
                <span className="flex items-start gap-2">
                  {!n.read_at && <span className="mt-2 size-2 shrink-0 rounded-full bg-sub" aria-label="Unread" />}
                  <span>{notificationText(n)}</span>
                </span>
                <span className="text-sm text-muted">{formatAgo(n.created_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
