import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import FeedbackForm from '@/components/feedback/FeedbackForm';

export const metadata = { title: 'Feedback' };

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { t } = await getT();
  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6">
      <div className="grid gap-2">
        <h1 className="handle flex flex-wrap items-center gap-3 text-[clamp(2.2rem,6vw,3.6rem)] leading-none">
          {t.beta.pageTitle}
          <span className="rounded-md border border-gold/50 bg-gold/15 px-2 py-0.5 font-mono text-sm tracking-widest text-gold uppercase">{t.beta.chip}</span>
        </h1>
        <p className="max-w-[62ch] text-muted">{t.beta.pageLead}</p>
      </div>
      {user ? (
        <FeedbackForm initialPage={from?.slice(0, 300) ?? ''} />
      ) : (
        <p className="rounded-2xl border border-line bg-surface p-6">
          <Link href="/login?next=/feedback" className="underline underline-offset-4">{t.nav.logIn}</Link> · {t.beta.loginFirst}
        </p>
      )}
    </main>
  );
}
