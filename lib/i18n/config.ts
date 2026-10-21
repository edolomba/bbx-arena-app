export const LOCALES = ['en', 'pt', 'es', 'it', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'bbx-locale';

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  pt: 'Português',
  es: 'Español',
  it: 'Italiano',
  fr: 'Français',
};

/** For dates and numbers. */
export const LOCALE_TAG: Record<Locale, string> = {
  en: 'en-GB',
  pt: 'pt-BR',
  es: 'es-ES',
  it: 'it-IT',
  fr: 'fr-FR',
};

export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (LOCALES as readonly string[]).includes(v);

/** Best match from an Accept-Language header, e.g. "pt-BR,pt;q=0.9,en;q=0.8". */
export function pickLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const wanted = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { lang: tag.toLowerCase().split('-')[0], q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const w of wanted) if (isLocale(w.lang)) return w.lang;
  return DEFAULT_LOCALE;
}
