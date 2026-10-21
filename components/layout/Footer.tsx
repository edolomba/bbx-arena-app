import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import LanguageSwitcher from '@/components/i18n/LanguageSwitcher';

export default async function Footer() {
  const { t } = await getT();
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-6 text-sm text-muted sm:px-6">
        <span className="handle text-ink">BBX Arena<span className="text-sub">.</span></span>
        <Link href="/mic-check" className="hover:text-ink">{t.footer.micCheck}</Link>
        <Link href="/terms" className="hover:text-ink">{t.footer.terms}</Link>
        <Link href="/privacy" className="hover:text-ink">{t.footer.privacy}</Link>
        {contact && <a href={`mailto:${contact}`} className="hover:text-ink">{t.footer.contact}</a>}
        <span className="ml-auto"><LanguageSwitcher /></span>
      </div>
    </footer>
  );
}
