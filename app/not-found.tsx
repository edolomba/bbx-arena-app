import Link from 'next/link';
import { getT } from '@/lib/i18n/server';

export default async function NotFound() {
  const { t } = await getT();
  return (
    <main className="mx-auto grid max-w-6xl justify-items-start gap-4 px-4 py-20 sm:px-6">
      <h1 className="handle text-5xl leading-none">{t.notFound.title}</h1>
      <p className="text-muted">{t.notFound.text}</p>
      <Link href="/" className="rounded-full bg-ink px-5 py-2.5 text-paper">{t.notFound.home}</Link>
    </main>
  );
}
