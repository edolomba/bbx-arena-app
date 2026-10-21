-- =============================================================================
-- BBX Arena: A–Z counts for the beatboxer list
-- Run ONCE in the Supabase SQL Editor, after 0001 to 0013.
-- =============================================================================
create or replace function public.directory_letters()
returns table (letter text, n int)
language sql stable security definer set search_path = public as $$
  select case when lower(left(username, 1)) ~ '^[a-z]$' then upper(left(username, 1)) else '#' end as letter,
         count(*)::int
    from profiles
   where deleted_at is null
   group by 1
   order by 1;
$$;
grant execute on function public.directory_letters() to anon, authenticated;
