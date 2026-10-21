import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import NotificationBell from './NotificationBell';
import Avatar from '@/components/Avatar';
import { getT } from '@/lib/i18n/server';

/** Site header. Server component: reads the session from cookies. */
export default async function Header() {
  const supabase = await createClient();
  const { t } = await getT();
  const { data: { user } } = await supabase.auth.getUser();
  let me: { username: string; is_admin: boolean; suspended_at: string | null } | null = null;
  if (user) {
    const { data } = await supabase.from('profiles').select('username, is_admin, suspended_at, avatar_url').eq('id', user.id).maybeSingle();
    me = data;
  }

  const link = 'rounded-full px-3 py-1.5 text-muted hover:text-ink';
  const sections = (
    <>
      <Link href="/battles" className={`${link} whitespace-nowrap`}>{t.nav.battles}</Link>
      <Link href="/events" className={`${link} whitespace-nowrap`}>{t.nav.events}</Link>
      <Link href="/beatboxers" className={`${link} whitespace-nowrap`}>{t.nav.beatboxers}</Link>
      <Link href="/ranking" className={`${link} whitespace-nowrap`}>{t.nav.ranking}</Link>
      {user && <Link href="/my-events" className={`${link} whitespace-nowrap md:hidden`}>{t.nav.myEvents}</Link>}
      {me?.is_admin && <Link href="/admin" className={`${link} whitespace-nowrap`}>{t.nav.moderation}</Link>}
    </>
  );
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex h-15 max-w-6xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
        <Link href="/" className="handle mr-2 text-lg whitespace-nowrap">
          BBX Arena<span className="text-sub">.</span>
        </Link>
        <nav aria-label="Sections" className="hidden min-w-0 gap-1 text-sm md:flex">{sections}</nav>
        <div className="ml-auto flex items-center gap-2 text-sm">
          {user ? (
            <>
              <Link href="/battles/new" className="hidden rounded-full bg-ink px-4 py-1.5 text-paper sm:inline-block">
                {t.nav.startBattle}
              </Link>
              <Link href="/my-events" className={`${link} hidden md:inline`}>{t.nav.myEvents}</Link>
              <NotificationBell userId={user.id} />
              {me && (
                <Link href={`/beatboxers/${me.username}`} aria-label={`@${me.username}`} className="rounded-full p-0.5 hover:ring-2 hover:ring-sub/60">
                  <Avatar username={me.username} url={(me as { avatar_url?: string | null }).avatar_url} size="xs" />
                </Link>
              )}
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
      <nav aria-label="Sections" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2 text-sm md:hidden">{sections}</nav>
      {me?.suspended_at && (
        <p role="alert" className="bg-loss px-4 py-2 text-center text-sm text-paper">
          {t.nav.suspended}
        </p>
      )}
    </header>
  );
}
