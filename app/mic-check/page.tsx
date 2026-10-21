import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import MicCheck from '@/components/mic/MicCheck';

export const metadata = { title: 'Mic check' };

export default async function MicCheckPage() {
  const { t } = await getT();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6">
      <div className="grid gap-2">
        <h1 className="handle text-[clamp(2.2rem,6vw,3.6rem)] leading-none">{t.mic.title}</h1>
        <p className="max-w-[62ch] text-muted">
          {t.mic.lead}
        </p>
      </div>
      <MicCheck signedIn={!!user} />
    </main>
  );
}
