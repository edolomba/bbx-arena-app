import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AuthForm from '@/components/auth/AuthForm';

const safeNext = (n?: string) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/');

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect(safeNext(next));
  return (
    <main className="mx-auto grid max-w-md gap-6 px-4 py-12">
      <h1 className="handle text-4xl leading-none">Log in</h1>
      <AuthForm mode="login" next={safeNext(next)} />
    </main>
  );
}
