-- =============================================================================
-- BBX Arena: rating leaderboard (podium, ELITE top 10, on fire, records)
-- Run ONCE in the Supabase SQL Editor, after 0001 to 0012.
-- Read-only functions: nothing is stored, everything comes from the rating
-- history, so it's always in sync with real results.
-- =============================================================================

create index if not exists elo_history_profile_idx on public.elo_history (profile_id, created_at desc);

-- Every rated beatboxer, best first, with recent form and a rating line.
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
         r.elo_rating, r.peak_elo, r.wins, r.battles_count,
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

-- Biggest rating gains over each player's last 5 rated battles.
create or replace function public.rating_on_fire(p_limit int default 5)
returns table (profile_id uuid, username text, avatar_url text, gain int)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.avatar_url, g.gain
    from profiles p
    cross join lateral (
      select sum(h.delta)::int as gain, max(h.created_at) as last_at
        from (select * from elo_history h where h.profile_id = p.id order by h.created_at desc limit 5) h
    ) g
   where p.deleted_at is null and g.gain > 0 and g.last_at > now() - interval '60 days'
   order by g.gain desc, g.last_at desc
   limit greatest(1, least(p_limit, 20));
$$;

-- All-time records, as one JSON object (null fields until there's data).
create or replace function public.rating_records()
returns jsonb
language sql stable security definer set search_path = public as $$
  with live as (select * from profiles where deleted_at is null),
  rated_games as (
    select b.finished_at, x.pid, (b.winner_id = x.pid) as won
      from battles b
      cross join lateral (values (b.challenger_id), (b.opponent_id)) x(pid)
     where b.status = 'finished' and b.ranked and b.result in ('decision', 'draw', 'forfeit')
  ),
  islands as (
    select pid, won,
           row_number() over (partition by pid order by finished_at)
         - row_number() over (partition by pid, won order by finished_at) as grp
      from rated_games
  ),
  streaks as (
    select pid, count(*)::int as len from islands where won group by pid, grp
  ),
  upsets as (
    select b.winner_id as pid,
           case when b.winner_id = b.challenger_id then b.opponent_id else b.challenger_id end as beaten,
           abs(b.challenger_elo_before - b.opponent_elo_before) as gap
      from battles b
     where b.status = 'finished' and b.ranked and b.winner_id is not null
       and case when b.winner_id = b.challenger_id then b.opponent_elo_before > b.challenger_elo_before
                else b.challenger_elo_before > b.opponent_elo_before end
  )
  select jsonb_build_object(
    'highest_elo', (select jsonb_build_object('value', peak_elo, 'username', username, 'avatar_url', avatar_url)
                      from live where battles_count > 0 order by peak_elo desc, username limit 1),
    'longest_streak', (select jsonb_build_object('value', s.len, 'username', p.username, 'avatar_url', p.avatar_url)
                         from streaks s join live p on p.id = s.pid order by s.len desc, p.username limit 1),
    'biggest_upset', (select jsonb_build_object('value', u.gap, 'username', p.username, 'avatar_url', p.avatar_url, 'beaten', q.username)
                        from upsets u join live p on p.id = u.pid join profiles q on q.id = u.beaten
                       order by u.gap desc limit 1),
    'most_battles', (select jsonb_build_object('value', battles_count, 'username', username, 'avatar_url', avatar_url)
                       from live where battles_count > 0 order by battles_count desc, username limit 1),
    'best_win_rate', (select jsonb_build_object('value', round(100.0 * wins / battles_count)::int, 'username', username,
                                                'avatar_url', avatar_url, 'battles', battles_count)
                        from live where battles_count >= 20 order by wins::numeric / battles_count desc, battles_count desc limit 1)
  );
$$;

grant execute on function public.rating_board(int)  to anon, authenticated;
grant execute on function public.rating_on_fire(int) to anon, authenticated;
grant execute on function public.rating_records()   to anon, authenticated;
