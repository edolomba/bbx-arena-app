'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LOCALES, LOCALE_COOKIE, LOCALE_NAMES, type Locale } from '@/lib/i18n/config';
import { useI18n } from './I18nProvider';

export default function LanguageSwitcher() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { locale, t } = useI18n();

  async function choose(next: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    // Remember it on the profile too, so notifications arrive in this language.
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('profiles').update({ locale: next }).eq('id', user.id);
    router.refresh();
  }

  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">{t.footer.language}</span>
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
        <circle cx="8" cy="8" r="6.5" /><path d="M1.5 8h13M8 1.5c2 2.2 2 10.8 0 13M8 1.5c-2 2.2-2 10.8 0 13" />
      </svg>
      <select value={locale} onChange={(e) => choose(e.target.value as Locale)}
        className="rounded-lg border border-line bg-surface px-2 py-1 text-sm text-ink">
        {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
      </select>
    </label>
  );
}
