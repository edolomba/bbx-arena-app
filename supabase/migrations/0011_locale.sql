-- =============================================================================
-- BBX Arena: each person's language (for notifications sent while they're away)
-- Run ONCE in the Supabase SQL Editor, after 0001 to 0010.
-- =============================================================================
alter table public.profiles add column locale text check (locale in ('en', 'pt', 'es', 'it', 'fr'));
grant update (locale) on public.profiles to authenticated;
