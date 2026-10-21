'use client';

import { createContext, useContext } from 'react';
import { getDict, type Dict } from '@/lib/i18n';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';

const Ctx = createContext<{ locale: Locale; t: Dict }>({ locale: DEFAULT_LOCALE, t: getDict(DEFAULT_LOCALE) });

/** Only the locale crosses from server to browser; the dictionary is looked up here. */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={{ locale, t: getDict(locale) }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
