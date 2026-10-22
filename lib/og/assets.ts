import { createClient } from '@supabase/supabase-js';

export const OG_SIZE = { width: 1200, height: 630 };
export const C = { paper: '#0a0a0d', surface: '#141418', line: '#2a2a33', ink: '#f3f3f6', muted: '#8d8d99', gold: '#d5ac11', sub: '#ff4fa3', win: '#3ddc84', loss: '#ff6060' };

/** Public, cookie-less client: share images only show public data. */
export function ogClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Any image URL (WebP included) as a square PNG data URL the renderer can draw; null if it can't be loaded. */
export async function squarePng(url: string | null | undefined, size: number): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const sharp = (await import('sharp')).default;
    const png = await sharp(Buffer.from(await res.arrayBuffer())).resize(size, size, { fit: 'cover' }).png().toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Archivo (the site's font) for the cards; falls back to the built-in font if Google Fonts can't be reached. */
let fontCache: Promise<{ name: string; data: ArrayBuffer; weight: 400 | 800; style: 'normal' }[] | undefined> | null = null;
export function ogFonts() {
  fontCache ??= (async () => {
    try {
      const load = async (weight: 400 | 800) => {
        // An old user agent makes Google Fonts answer with TrueType, which the renderer understands.
        const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@112,${weight}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.30 (KHTML, like Gecko) Safari/534.30' },
          signal: AbortSignal.timeout(3000),
        })).text();
        const src = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
        if (!src) throw new Error('no ttf');
        return { name: 'Archivo', data: await (await fetch(src, { signal: AbortSignal.timeout(3000) })).arrayBuffer(), weight, style: 'normal' as const };
      };
      return [await load(400), await load(800)];
    } catch {
      return undefined;
    }
  })();
  return fontCache;
}

export const initials = (name: string) => name.slice(0, 1).toUpperCase();
