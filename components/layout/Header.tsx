import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import NotificationBell from './NotificationBell';
import { getT } from '@/lib/i18n/server';

/** Site header. Server component: reads the session from cookies. */
export default async function Header() {
  const supabase = await createClient();
  const { t } = await getT();
  const { data: { user } } = await supabase.auth.getUser();
  let me: { username: string; is_admin: boolean; suspended_at: string | null } | null = null;
  if (user) {
    const { data } = await supabase.from('profiles').select('username, is_admin, suspended_at').eq('id', user.id).maybeSingle();
    me = data;
  }

  const link = 'rounded-full px-3 py-1.5 text-muted hover:text-ink';
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex h-15 max-w-6xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
        <Link href="/" className="handle mr-2 text-lg whitespace-nowrap">
          BBX Arena<span className="text-sub">.</span>
        </Link>
        <nav aria-label="Sections" className="flex min-w-0 gap-1 overflow-x-auto text-sm">
          <Link href="/battles" className={link}>{t.nav.battles}</Link>
          <Link href="/events" className={link}>{t.nav.events}</Link>
          <Link href="/beatboxers" className={link}>{t.nav.beatboxers}</Link>
          <Link href="/ranking" className={link}>{t.nav.ranking}</Link>
          {me?.is_admin && <Link href="/admin" className={link}>{t.nav.moderation}</Link>}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm">
          {user ? (
            <>
              <Link href="/battles/new" className="hidden rounded-full bg-ink px-4 py-1.5 text-paper sm:inline-block">
                {t.nav.startBattle}
              </Link>
              <Link href="/my-events" className={`${link} hidden md:inline`}>{t.nav.myEvents}</Link>
              <NotificationBell userId={user.id} />
              {me && <Link href={`/beatboxers/${me.username}`} className={`${link} hidden sm:inline`}>@{me.username}</Link>}
              <form action="/auth/signout" method="post">
                <button className={link}>{t.nav.logOut}</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className={link}>{t.nav.logIn}</Link>
              <Link href="/signup" className="rounded-full bg-ink px-4 py-1.5 text-paper">{t.nav.signUp}</Link>
            </>
          )}
        </div>
      </div>
      {me?.suspended_at && (
        <p role="alert" className="bg-loss px-4 py-2 text-center text-sm text-paper">
          {t.nav.suspended}
        </p>
      )}
    </header>
  );
}
