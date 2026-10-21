import { cookies, headers } from 'next/headers';
import { LOCALE_COOKIE, isLocale, pickLocale, type Locale } from './config';
import { getDict } from './index';

/** The visitor's language: their choice (cookie) first, then the browser's. */
export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  return pickLocale((await headers()).get('accept-language'));
}

export async function getT() {
  const locale = await getLocale();
  return { locale, t: getDict(locale) };
}
