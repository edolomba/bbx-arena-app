import { en, type Dict } from './en';
import { pt } from './pt';
import { es } from './es';
import { it } from './it';
import { fr } from './fr';
import type { Locale } from './config';

export const DICTS: Record<Locale, Dict> = { en, pt, es, it, fr };
export const getDict = (locale: Locale): Dict => DICTS[locale] ?? en;
export type { Dict };
