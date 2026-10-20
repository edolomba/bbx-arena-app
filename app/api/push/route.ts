import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';
import { notificationText } from '@/lib/notifications';
import type { AppNotification } from '@/lib/types';

/**
 * Called by the database (trigger notifications_dispatch_push) for every new
 * notification. Delivers it to every device the person turned push on for,
 * and forgets devices the push service says are gone.
 */
export async function POST(request: Request) {
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  if (!secret || request.headers.get('x-push-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: 'Push keys are not set in Vercel.' }, { status: 500 });
  }
  webpush.setVapidDetails(
    `mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'admin@example.com'}`,
    publicKey,
    privateKey,
  );

  const { notification_id: id } = (await request.json().catch(() => ({}))) as { notification_id?: string };
  if (!id) return NextResponse.json({ error: 'Missing notification_id' }, { status: 400 });

  const admin = createAdminClient();
  const { data: n } = await admin
    .from('notifications')
    .select('id, user_id, kind, battle_id, data, created_at, read_at, actor:profiles!notifications_actor_id_fkey(username)')
    .eq('id', id)
    .maybeSingle();
  if (!n) return NextResponse.json({ ok: true, sent: 0 });

  const { data: devices } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', n.user_id);
  const payload = JSON.stringify({
    title: 'BBX Arena',
    body: notificationText(n as unknown as AppNotification),
    url: n.battle_id ? `/battles/${n.battle_id}` : '/notifications',
    tag: n.battle_id ?? n.id,
  });

  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    (devices ?? []).map(async (d) => {
      try {
        await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, { TTL: 60 * 60 * 24, urgency: 'high' });
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(d.id);
      }
    }),
  );
  if (gone.length) await admin.from('push_subscriptions').delete().in('id', gone);
  if (sent) await admin.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('user_id', n.user_id);

  return NextResponse.json({ ok: true, sent, removed: gone.length });
}
