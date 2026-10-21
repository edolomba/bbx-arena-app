import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import BeatboxerCard from '@/components/directory/BeatboxerCard';
import { countryName } from '@/lib/format';
import { getT } from '@/lib/i18n/server';
import type { DirectoryEntry, ProfileBattle } from '@/lib/types';

const PAGE_SIZE = 24;
const SORTS = {
  rating: { column: 'elo_rating', label: 'rating' },
  battles: { column: 'battles_count', label: 'battles' },
  winrate: { column: 'win_rate', label: 'winrate' },
  newest: { column: 'created_at', label: 'newest' },
} as const;

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function BeatboxersPage({ searchParams }: { searchParams: SearchParams }) {
  const { locale, t: all } = await getT();
  const t = all.dir;
  const params = await searchParams;
  const q = (params.q ?? '').replace(/[^\p{L}\p{N}_. ]/gu, '').trim().slice(0, 40);
  const country = /^[A-Z]{2}$/.test(params.country ?? '') ? params.country! : '';
  const sort = (params.sort && params.sort in SORTS ? params.sort : 'rating') as keyof typeof SORTS;
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  const supabase = await createClient();
  let query = supabase.from('directory_entries').select('*', { count: 'exact' });
  if (q) query = query.or(`username.ilike.%${q}%,full_name.ilike.%${q}%`);
  if (country) query = query.eq('country', country);
  query = query
    .order(SORTS[sort].column, { ascending: false, nullsFirst: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const [{ data, count, error }, { data: countries }] = await Promise.all([
    query,
    supabase.from('directory_countries').select('country, beatboxers'),
  ]);
  const entries = (data ?? []) as DirectoryEntry[];

  const { data: recentRows } = entries.length
    ? await supabase.from('profile_battles').select('*').in('profile_id', entries.map((e) => e.id)).lte('rn', 5).order('rn')
    : { data: [] };
  const recentBy = new Map<string, ProfileBattle[]>();
  for (const r of (recentRows ?? []) as ProfileBattle[]) recentBy.set(r.profile_id, [...(recentBy.get(r.profile_id) ?? []), r]);

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hrefFor = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (country) sp.set('country', country);
    if (sort !== 'rating') sp.set('sort', sort);
    if (p > 1) sp.set('page', String(p));
    return `/beatboxers${sp.size ? `?${sp}` : ''}`;
  };
  const sortedCountries = (countries ?? [])
    .map((c) => ({ ...c, name: countryName(c.country, locale) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const field = 'rounded-lg border border-line bg-surface px-3 py-2';

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6">
      <header className="grid gap-2">
        <h1 className="handle text-[clamp(2.5rem,7vw,4.5rem)] leading-none">{t.title}</h1>
        <p className="text-muted">
          {t.count(total.toLocaleString(), total === 1, !!(q || country))}
        </p>
      </header>

      <form className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]" role="search">
        <label className="grid gap-1 text-sm">
          <span className="text-muted">{t.search}</span>
          <input name="q" defaultValue={q} placeholder={t.searchPh} className={field} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">{t.country}</span>
          <select name="country" defaultValue={country} className={field}>
            <option value="">{t.anywhere}</option>
            {sortedCountries.map((c) => <option key={c.country} value={c.country}>{c.name} ({c.beatboxers})</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">{t.sortBy}</span>
          <select name="sort" defaultValue={sort} className={field}>
            {Object.entries(SORTS).map(([value, s]) => <option key={value} value={value}>{t[s.label as 'rating' | 'battles' | 'winrate' | 'newest']}</option>)}
          </select>
        </label>
        <button type="submit" className="self-end rounded-full bg-ink px-5 py-2.5 text-paper">{t.apply}</button>
      </form>

      {error ? (
        <p role="alert" className="text-loss">{t.loadFailed(error.message)}</p>
      ) : entries.length === 0 ? (
        <div className="grid justify-items-start gap-2 rounded-2xl border border-dashed border-line p-8">
          <p className="text-lg">{t.none}</p>
          <Link href="/beatboxers" className="underline underline-offset-4">{t.clear}</Link>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((e) => <li key={e.id} className="grid"><BeatboxerCard entry={e} recent={recentBy.get(e.id) ?? []} /></li>)}
        </ul>
      )}

      {lastPage > 1 && (
        <nav aria-label={t.pages} className="flex items-center justify-between">
          {page > 1 ? <Link href={hrefFor(page - 1)} className="underline underline-offset-4">{t.prev}</Link> : <span />}
          <span className="num text-muted">{t.pageOf(page, lastPage)}</span>
          {page < lastPage ? <Link href={hrefFor(page + 1)} className="underline underline-offset-4">{t.next}</Link> : <span />}
        </nav>
      )}
    </main>
  );
}
