import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import Link from 'next/link';
import CreateBattleForm from '@/components/battle/CreateBattleForm';
import CreateTagBattleForm from '@/components/battle/CreateTagBattleForm';

export default async function NewBattlePage({ searchParams }: { searchParams: Promise<{ opponent?: string; format?: string }> }) {
  const { t } = await getT();
  const { opponent, format } = await searchParams;
  const tag = format === 'tag';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent('/battles/new' + (opponent ? `?opponent=${opponent}` : ''))}`);
  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6">
      <h1 className="handle text-[clamp(2.2rem,6vw,3.6rem)] leading-none">{t.create.title}</h1>
      <nav aria-label={t.tag.format} className="flex flex-wrap gap-2">
        <Link href="/battles/new" aria-current={!tag ? 'page' : undefined} className={`rounded-full px-5 py-2 ${!tag ? 'bg-ink text-paper' : 'border border-line text-muted hover:text-ink'}`}>{t.tag.solo}</Link>
        <Link href="/battles/new?format=tag" aria-current={tag ? 'page' : undefined} className={`rounded-full px-5 py-2 ${tag ? 'bg-ink text-paper' : 'border border-line text-muted hover:text-ink'}`}>{t.tag.tagTeam}</Link>
      </nav>
      {tag ? <CreateTagBattleForm userId={user!.id} /> : <CreateBattleForm defaultOpponent={opponent ?? ''} />}
    </main>
  );
}
