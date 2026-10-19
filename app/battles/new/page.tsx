import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import CreateBattleForm from '@/components/battle/CreateBattleForm';

export default async function NewBattlePage({ searchParams }: { searchParams: Promise<{ opponent?: string }> }) {
  const { opponent } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent('/battles/new' + (opponent ? `?opponent=${opponent}` : ''))}`);
  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6">
      <h1 className="handle text-[clamp(2.2rem,6vw,3.6rem)] leading-none">Start a battle</h1>
      <CreateBattleForm defaultOpponent={opponent ?? ''} />
    </main>
  );
}
