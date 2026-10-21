import { createClient } from '@/lib/supabase/server';
import MicCheck from '@/components/mic/MicCheck';

export const metadata = { title: 'Mic check' };

export default async function MicCheckPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6">
      <div className="grid gap-2">
        <h1 className="handle text-[clamp(2.2rem,6vw,3.6rem)] leading-none">Mic check</h1>
        <p className="max-w-[62ch] text-muted">
          Two minutes before a battle: check that your mic catches everything, from bass to clicks, that nothing is distorting,
          and that your connection can carry a live round.
        </p>
      </div>
      <MicCheck signedIn={!!user} />
    </main>
  );
}
