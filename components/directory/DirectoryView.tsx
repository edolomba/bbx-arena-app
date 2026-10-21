import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import Avatar from '@/components/Avatar';
import BadgeChip from '@/components/badges/BadgeChip';
import type { DirectoryEntry } from '@/lib/types';

export const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];

export default async function DirectoryView({ entries, counts: countList, total, mode, q, letter, found, page, lastPage, hrefs, error, top: TOP }: {
  entries: DirectoryEntry[]; counts: [string, number][]; total: number; mode: 'top' | 'letter' | 'search'; q: string; letter: string;
  found: number; page: number; lastPage: number; hrefs: { prev: string; next: string }; error: string | null; top: number;
}) {
  const { t: all } = await getT();
  const t = all.dir;
  const counts = new Map(countList);
  const chip = (active: boolean) =>
    `rounded-md border px-2 py-1 font-mono text-sm transition-colors ${active ? 'border-sub bg-sub/15 text-sub' : 'border-line text-ink hover:border-muted'}`;

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-baseline gap-3">
        <h1 className="handle text-[clamp(2.2rem,6vw,3.6rem)] leading-none">{t.title}</h1>
        <span className="num text-xl text-muted">({total.toLocaleString()})</span>
      </header>

      <nav aria-label="A–Z" className="flex flex-wrap gap-1.5">
        <Link href="/beatboxers" aria-current={mode === 'top' ? 'page' : undefined} className={chip(mode === 'top')}>{t.top}</Link>
        {LETTERS.map((l) => {
          const n = counts.get(l) ?? 0;
          return n === 0 ? (
            <span key={l} className="rounded-md border border-line/50 px-2 py-1 font-mono text-sm text-muted/40">{l}</span>
          ) : (
            <Link key={l} href={`/beatboxers?l=${encodeURIComponent(l)}`} aria-current={letter === l ? 'page' : undefined} className={chip(letter === l)}>
              {l} <span className="text-[0.65rem] text-muted">{n}</span>
            </Link>
          );
        })}
      </nav>

      <form role="search" className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 focus-within:border-sub/60">
        <svg viewBox="0 0 20 20" className="size-5 shrink-0 text-muted" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="9" cy="9" r="6" /><path d="m14 14 4 4" strokeLinecap="round" />
        </svg>
        <label className="sr-only" htmlFor="dir-q">{t.search}</label>
        <input id="dir-q" name="q" defaultValue={q} placeholder={t.searchBig} className="min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-muted" />
        <button type="submit" className="font-mono text-sm text-sub hover:underline">{t.searchPh} →</button>
      </form>

      <p className="text-sm text-muted">
        {mode === 'search' ? t.searchLead(q, found) : mode === 'letter' ? t.letterLead(letter, found) : t.topLead(Math.min(TOP, entries.length))}
      </p>

      {error ? (
        <p role="alert" className="text-loss">{t.loadFailed(error)}</p>
      ) : entries.length === 0 ? (
        <div className="grid justify-items-start gap-2 rounded-2xl border border-dashed border-line p-8">
          <p className="text-lg">{t.none}</p>
          <Link href="/beatboxers" className="underline underline-offset-4">{t.clear}</Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
          {entries.map((e) => (
            <li key={e.id}>
              <Link href={`/beatboxers/${e.username}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface">
                <Avatar username={e.username} url={e.avatar_url} size="md" ring={e.global_rank === 1 && e.battles_count > 0 ? 'gold' : 'none'} />
                <span className="grid min-w-0">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-bold">{e.username}</span>
                    {e.featured_badge && <BadgeChip code={e.featured_badge} iconOnly />}
                  </span>
                  <span className="font-mono text-[0.7rem] text-muted">
                    {e.country ? `${e.country} · ` : ''}{t.battlesN(e.battles_count)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {lastPage > 1 && (
        <nav aria-label={t.pages} className="flex items-center justify-between">
          {page > 1 ? <Link href={hrefs.prev} className="underline underline-offset-4">{t.prev}</Link> : <span />}
          <span className="num text-muted">{t.pageOf(page, lastPage)}</span>
          {page < lastPage ? <Link href={hrefs.next} className="underline underline-offset-4">{t.next}</Link> : <span />}
        </nav>
      )}
    </main>
  );
}
