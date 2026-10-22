-- =============================================================================
-- Beatbox Arena: records as wins-losses ("3-2") everywhere
-- Run ONCE in the Supabase SQL Editor, after 0001 to 0018.
-- The leaderboard now also returns losses and draws.
-- =============================================================================
drop function if exists public.rating_board(int);

create or replace function public.rating_board(p_limit int default 100)
returns table (
  rank            int,
  profile_id      uuid,
  username        text,
  avatar_url      text,
  country         text,
  featured_badge  text,
  elo             int,
  peak            int,
  wins            int,
  losses          int,
  draws           int,
  battles         int,
  last5           text,      -- newest last, e.g. 'WWLDW'
  spark           int[],     -- rating after each of the last 12 rated battles, oldest first
  last_delta      int,
  upsets          int        -- rated wins against someone 200+ above
)
language sql stable security definer set search_path = public as $$
  with rated as (
    select p.* from profiles p
     where p.deleted_at is null and p.battles_count > 0
  ),
  ranked as (
    select r.*, (rank() over (order by r.elo_rating desc, r.wins desc, r.created_at))::int as rnk
      from rated r
  )
  select r.rnk, r.id, r.username, r.avatar_url, r.country, r.featured_badge,
         r.elo_rating, r.peak_elo, r.wins, r.losses, r.draws, r.battles_count,
         coalesce((select string_agg(case when b.winner_id = r.id then 'W' when b.result = 'draw' then 'D' else 'L' end, '' order by b.finished_at)
                     from (select * from battles b
                            where b.status = 'finished' and b.ranked and b.result in ('decision', 'draw', 'forfeit')
                              and r.id in (b.challenger_id, b.opponent_id)
                            order by b.finished_at desc limit 5) b), ''),
         coalesce((select array_agg(h.elo_after order by h.created_at)
                     from (select * from elo_history h where h.profile_id = r.id order by h.created_at desc limit 12) h), '{}'),
         (select h.delta from elo_history h where h.profile_id = r.id order by h.created_at desc limit 1),
         (select count(*)::int from battles b
           where b.status = 'finished' and b.ranked and b.winner_id = r.id
             and case when b.challenger_id = r.id then b.opponent_elo_before - b.challenger_elo_before
                      else b.challenger_elo_before - b.opponent_elo_before end >= 200)
    from ranked r
   order by r.rnk, r.username
   limit greatest(1, least(p_limit, 500));
$$;

grant execute on function public.rating_board(int) to anon, authenticated;
