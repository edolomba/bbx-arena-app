import { createClient } from '@/lib/supabase/server';
import type { DirectoryEntry } from '@/lib/types';

import DirectoryView, { LETTERS } from '@/components/directory/DirectoryView';

const TOP = 60;
const PAGE_SIZE = 60;

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function BeatboxersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = (params.q ?? '').replace(/[^\p{L}\p{N}_. ]/gu, '').trim().slice(0, 40);
  const letter = LETTERS.includes((params.l ?? '').toUpperCase()) ? (params.l ?? '').toUpperCase() : '';
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const mode: 'top' | 'letter' | 'search' = q ? 'search' : letter ? 'letter' : 'top';

  const supabase = await createClient();
  let query = supabase.from('directory_entries').select('*', { count: 'exact' });
  if (mode === 'search') {
    query = query.or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
      .order('battles_count', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  } else if (mode === 'letter') {
    query = (letter === '#' ? query.filter('username', 'imatch', '^[^a-z]') : query.ilike('username', `${letter}%`))
      .order('username').range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  } else {
    query = query.order('battles_count', { ascending: false }).order('elo_rating', { ascending: false }).limit(TOP);
  }

  const [{ data, count, error }, { data: letterRows }] = await Promise.all([query, supabase.rpc('directory_letters')]);
  const entries = (data ?? []) as DirectoryEntry[];
  const counts = new Map(((letterRows ?? []) as { letter: string; n: number }[]).map((r) => [r.letter, r.n]));
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const found = count ?? entries.length;
  const lastPage = mode === 'top' ? 1 : Math.max(1, Math.ceil(found / PAGE_SIZE));
  const hrefFor = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (letter) sp.set('l', letter);
    if (p > 1) sp.set('page', String(p));
    return `/beatboxers${sp.size ? `?${sp}` : ''}`;
  };

  return <DirectoryView entries={entries} counts={[...counts.entries()]} total={total} mode={mode} q={q} letter={letter}
    found={found} page={page} lastPage={lastPage} hrefs={{ prev: hrefFor(page - 1), next: hrefFor(page + 1) }} error={error?.message ?? null} top={TOP} />;
}
