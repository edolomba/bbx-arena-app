import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import { LOCALE_TAG } from '@/lib/i18n/config';

/** Home page card: we're in beta, what changed lately, and how to send feedback. */
export default async function BetaNotice() {
  const { locale, t: all } = await getT();
  const t = all.beta;
  return (
    <section aria-labelledby="beta-title" className="grid gap-5 rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/10 via-surface to-surface p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
      <div className="grid gap-3">
        <h2 id="beta-title" className="flex flex-wrap items-center gap-3 text-xl font-bold">
          <span className="rounded-md border border-gold/50 bg-gold/15 px-2 py-0.5 font-mono text-xs tracking-widest text-gold uppercase">{t.chip}</span>
          {t.title}
        </h2>
        <p className="max-w-[70ch] text-muted">{t.text}</p>
        <div className="grid gap-1.5">
          <p className="label">{t.whatsNew}</p>
          <ul className="grid gap-1.5">
            {t.news.slice(0, 4).map((n) => (
              <li key={n.date + n.text} className="flex gap-3 text-sm">
                <span className="shrink-0 font-mono text-xs text-gold">
                  {new Date(n.date).toLocaleDateString(LOCALE_TAG[locale], { day: 'numeric', month: 'short' })}
                </span>
                <span>{n.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Link href="/feedback" className="justify-self-start rounded-full bg-ink px-6 py-3 text-paper sm:justify-self-end">{t.cta}</Link>
    </section>
  );
}
