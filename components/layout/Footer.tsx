import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import LanguageSwitcher from '@/components/i18n/LanguageSwitcher';

export default async function Footer() {
  const { t } = await getT();
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-6 text-sm text-muted sm:px-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Beatbox Arena" width={95} height={24} className="h-6 w-auto opacity-90" />
        <Link href="/rules" className="hover:text-ink">{t.footer.rules}</Link>
        <Link href="/mic-check" className="hover:text-ink">{t.footer.micCheck}</Link>
        <Link href="/feedback" className="hover:text-ink">{t.beta.pageTitle}</Link>
        <Link href="/terms" className="hover:text-ink">{t.footer.terms}</Link>
        <Link href="/privacy" className="hover:text-ink">{t.footer.privacy}</Link>
        {contact && <a href={`mailto:${contact}`} className="hover:text-ink">{t.footer.contact}</a>}
        <span className="ml-auto"><LanguageSwitcher /></span>
      </div>
    </footer>
  );
}
