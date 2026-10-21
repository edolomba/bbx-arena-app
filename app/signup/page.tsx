import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AuthForm from '@/components/auth/AuthForm';
import { getT } from '@/lib/i18n/server';

const safeNext = (n?: string) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/');

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { t } = await getT();
  const { next } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect(safeNext(next));
  return (
    <main className="mx-auto grid max-w-md gap-6 px-4 py-12">
      <div className="grid gap-2">
        <h1 className="handle text-4xl leading-none">{t.auth.signupTitle}</h1>
        <p className="text-muted">{t.auth.signupLead}</p>
      </div>
      <AuthForm mode="signup" next={safeNext(next)} />
    </main>
  );
}
