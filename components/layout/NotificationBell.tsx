'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { notificationHref, notificationText } from '@/lib/notifications';
import { formatAgo } from '@/lib/format';
import { useI18n } from '@/components/i18n/I18nProvider';
import PushToggle from '@/components/push/PushToggle';
import type { AppNotification } from '@/lib/types';

const SELECT = 'id, kind, battle_id, event_id, data, created_at, read_at, actor:profiles!notifications_actor_id_fkey(username)';

export default function NotificationBell({ userId }: { userId: string }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read_at).length;

  const load = useCallback(async () => {
    const { data } = await supabase.from('notifications').select(SELECT).order('created_at', { ascending: false }).limit(15);
    setItems((data ?? []) as unknown as AppNotification[]);
  }, [supabase]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => {
        void load();
        router.refresh();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, load, router]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!panelRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function markAll() {
    await supabase.rpc('mark_notifications_read', { p_ids: null });
    setItems((xs) => xs.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  }

  async function openItem(n: AppNotification) {
    setOpen(false);
    if (!n.read_at) {
      await supabase.rpc('mark_notifications_read', { p_ids: [n.id] });
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    }
    router.push(notificationHref(n));
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={unread ? t.notifications.bellUnread(unread) : t.notifications.bell}
        className="relative grid size-9 place-items-center rounded-full text-muted hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="num absolute -top-0.5 -right-0.5 grid min-w-4.5 place-items-center rounded-full bg-sub px-1 text-[0.65rem] leading-4.5 text-paper">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-semibold">{t.notifications.title}</p>
            {unread > 0 && <button onClick={markAll} className="text-sm text-muted hover:text-ink">{t.notifications.markAll}</button>}
          </div>
          <PushToggle compact />
          {items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">{t.notifications.empty}</p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button onClick={() => openItem(n)} className={`grid w-full gap-0.5 border-b border-line px-4 py-3 text-left text-sm hover:bg-paper ${n.read_at ? 'text-muted' : ''}`}>
                    <span className="flex items-start gap-2">
                      {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-sub" aria-label={t.notifications.unread} />}
                      <span>{notificationText(n, locale, t)}</span>
                    </span>
                    <span className="text-xs text-muted">{formatAgo(n.created_at, Date.now(), t.time)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link href="/notifications" onClick={() => setOpen(false)} className="block px-4 py-3 text-center text-sm text-muted hover:text-ink">
            {t.notifications.seeAll}
          </Link>
        </div>
      )}
    </div>
  );
}
