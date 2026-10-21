import LegalPage from '@/components/LegalPage';
import { CONTACT_FALLBACK, TERMS } from '@/lib/legal';
import { getLocale } from '@/lib/i18n/server';
import { LOCALE_TAG } from '@/lib/i18n/config';

export async function generateMetadata() {
  return { title: TERMS[await getLocale()].title };
}

export default async function TermsPage() {
  const locale = await getLocale();
  const doc = TERMS[locale];
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? CONTACT_FALLBACK[locale];
  const updated = new Date(doc.updated).toLocaleDateString(LOCALE_TAG[locale], { day: 'numeric', month: 'long', year: 'numeric' });
  return <LegalPage doc={doc} contact={contact} updated={updated} />;
}
