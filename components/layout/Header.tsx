import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

/** Site header. Server component: reads the session from cookies. */
export default async function Header() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let username: string | null = null;
  if (user) {
    const { data } = await supabase.from('profiles').select('username').eq('id', user.id).maybeSingle();
    username = data?.username ?? null;
  }

  const link = 'rounded-full px-3 py-1.5 text-muted hover:text-ink';
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper">
      <div className="mx-auto flex h-15 max-w-6xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
        <Link href="/" className="handle mr-2 text-lg whitespace-nowrap">
          BBX Arena<span className="text-sub">.</span>
        </Link>
        <nav aria-label="Sections" className="flex min-w-0 gap-1 overflow-x-auto text-sm">
          <Link href="/battles" className={link}>Battles</Link>
          <Link href="/beatboxers" className={link}>Beatboxers</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm">
          {user ? (
            <>
              <Link href="/battles/new" className="hidden rounded-full bg-ink px-4 py-1.5 text-paper sm:inline-block">
                Start a battle
              </Link>
              {username && (
                <Link href={`/beatboxers/${username}`} className={link}>@{username}</Link>
              )}
              <form action="/auth/signout" method="post">
                <button className={link}>Log out</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className={link}>Log in</Link>
              <Link href="/signup" className="rounded-full bg-ink px-4 py-1.5 text-paper">Sign up</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
