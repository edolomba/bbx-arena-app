-- =============================================================================
-- BBX Arena: events, part B: knockout or Swiss main stage, small final,
-- final, placements and ranking points.
-- Run ONCE in the Supabase SQL Editor, after 0001 to 0007.
--
-- Every match is a Stage battle run by the event host with the event judges.
-- Knockout seeding: 1 vs last, and seeds 1 and 2 can only meet in the final.
-- Swiss: rounds paired by wins (no rematches when avoidable), then the top 4
-- play semifinals, small final and final.
-- Ranked + approved events award placement points: 1st 1000, 2nd 500,
-- 3rd 350, 4th 200, 5th to 8th 100.
-- =============================================================================

alter type public.point_reason add value if not exists 'tournament';

alter table public.point_events alter column battle_id drop not null;
alter table public.point_events add column event_id uuid references public.events (id) on delete cascade;
create unique index point_events_event_uq on public.point_events (profile_id, event_id) where event_id is not null;

alter table public.events
  add column current_battle_id uuid references public.battles (id),
  add column swiss_rounds smallint;

alter table public.battles add column event_id uuid references public.events (id) on delete set null;

create table public.event_matches (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  phase       text not null check (phase in ('swiss', 'knockout', 'small_final')),
  round       smallint not null,
  slot        smallint not null,
  a_id        uuid references public.profiles (id),
  b_id        uuid references public.profiles (id),
  battle_id   uuid references public.battles (id),
  winner_id   uuid references public.profiles (id),
  walkover    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (event_id, phase, round, slot)
);
create index event_matches_battle_idx on public.event_matches (battle_id);
alter table public.event_matches enable row level security;
create policy "Matches are public" on public.event_matches for select using (true);

-- -----------------------------------------------------------------------------
-- Seeding order so the top seeds meet as late as possible: 8 -> 1,8,4,5,2,7,3,6
-- -----------------------------------------------------------------------------
create or replace function public.bracket_order(p_n int) returns int[]
language plpgsql immutable as $$
declare
  o int[] := array[1, 2];
  nxt int[];
  m int;
  s int;
begin
  while cardinality(o) < p_n loop
    nxt := '{}';
    m := cardinality(o) * 2;
    foreach s in array o loop
      nxt := nxt || s || (m + 1 - s);
    end loop;
    o := nxt;
  end loop;
  return o;
end $$;

-- Knockout round 1 for a list of players already in seed order.
create or replace function public.create_knockout(p_event uuid, p_players uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  n   int := cardinality(p_players);
  ord int[] := bracket_order(n);
  i   int;
begin
  for i in 0 .. n / 2 - 1 loop
    insert into event_matches (event_id, phase, round, slot, a_id, b_id)
    values (p_event, 'knockout', 1, i, p_players[ord[2 * i + 1]], p_players[ord[2 * i + 2]]);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Swiss standings: wins, then Buchholz (opponents' wins), then elimination place
-- -----------------------------------------------------------------------------
create or replace function public.swiss_standings(p_event uuid)
returns table (profile_id uuid, wins int, buchholz int, seed int, pos int)
language sql stable security definer set search_path = public as $$
  with players as (
    select x.profile_id, x.elim_place from event_entries x where x.event_id = p_event and x.status = 'qualified'
  ),
  games as (
    select a_id as p, b_id as o, winner_id from event_matches where event_id = p_event and phase = 'swiss' and winner_id is not null
    union all
    select b_id, a_id, winner_id from event_matches where event_id = p_event and phase = 'swiss' and winner_id is not null
  ),
  w as (
    select pl.profile_id, count(g.*) filter (where g.winner_id = pl.profile_id)::int as wins
      from players pl left join games g on g.p = pl.profile_id group by pl.profile_id
  ),
  b as (
    select pl.profile_id, coalesce(sum(wo.wins), 0)::int as buchholz
      from players pl left join games g on g.p = pl.profile_id left join w wo on wo.profile_id = g.o
     group by pl.profile_id
  )
  select pl.profile_id, w.wins, b.buchholz, pl.elim_place,
         (row_number() over (order by w.wins desc, b.buchholz desc, pl.elim_place))::int
    from players pl join w using (profile_id) join b using (profile_id)
   order by 5;
$$;

-- Pair the next Swiss round: best available opponent you haven't met yet.
create or replace function public.create_swiss_round(p_event uuid, p_round int) returns void
language plpgsql security definer set search_path = public as $$
declare
  pool  uuid[];
  used  uuid[] := '{}';
  a     uuid;
  b     uuid;
  i     int;
  j     int;
  slot  int := 0;
begin
  select array_agg(profile_id order by pos) into pool from swiss_standings(p_event);
  if p_round = 1 then
    -- top half meets bottom half: 1 v n/2+1, 2 v n/2+2 ...
    select array_agg(x.profile_id order by x.elim_place) into pool
      from event_entries x where x.event_id = p_event and x.status = 'qualified';
    for i in 1 .. cardinality(pool) / 2 loop
      insert into event_matches (event_id, phase, round, slot, a_id, b_id)
      values (p_event, 'swiss', 1, i - 1, pool[i], pool[i + cardinality(pool) / 2]);
    end loop;
    return;
  end if;

  for i in 1 .. cardinality(pool) loop
    a := pool[i];
    continue when a = any (used);
    b := null;
    -- first opponent not met before
    for j in i + 1 .. cardinality(pool) loop
      continue when pool[j] = any (used);
      if not exists (select 1 from event_matches m where m.event_id = p_event and m.phase = 'swiss'
                       and ((m.a_id = a and m.b_id = pool[j]) or (m.a_id = pool[j] and m.b_id = a))) then
        b := pool[j];
        exit;
      end if;
    end loop;
    -- otherwise accept a rematch rather than leave someone out
    if b is null then
      for j in i + 1 .. cardinality(pool) loop
        if not (pool[j] = any (used)) then b := pool[j]; exit; end if;
      end loop;
    end if;
    exit when b is null;
    used := used || a || b;
    insert into event_matches (event_id, phase, round, slot, a_id, b_id) values (p_event, 'swiss', p_round, slot, a, b);
    slot := slot + 1;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Build the main stage after the classification is published
-- -----------------------------------------------------------------------------
create or replace function public.host_build_bracket(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  e        events := event_for_host(p_event);
  players  uuid[];
begin
  if e.status <> 'main' or e.published_at is null then
    raise exception 'Publish the eliminations first.' using errcode = '22023';
  end if;
  if exists (select 1 from event_matches where event_id = e.id) then
    raise exception 'The bracket already exists.' using errcode = '22023';
  end if;
  if e.main_format = 'knockout' then
    select array_agg(profile_id order by elim_place) into players
      from event_entries where event_id = e.id and status = 'qualified';
    perform create_knockout(e.id, players);
  else
    update events set swiss_rounds = greatest(2, round(log(2, e.advance_count))::int) where id = e.id;
    perform create_swiss_round(e.id, 1);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Put a match on stage: creates its Stage battle, live right away
-- -----------------------------------------------------------------------------
create or replace function public.host_open_match(p_event uuid, p_match uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  e   events := event_for_host(p_event);
  m   event_matches;
  bid uuid;
begin
  if not e.live then raise exception 'Resume the event first.' using errcode = '22023'; end if;
  select * into m from event_matches where id = p_match and event_id = e.id for update;
  if not found then raise exception 'That match doesn''t exist.' using errcode = 'P0002'; end if;
  if m.winner_id is not null then raise exception 'That match is already decided.' using errcode = '22023'; end if;
  if m.a_id is null or m.b_id is null then raise exception 'Both battlers aren''t known yet.' using errcode = '22023'; end if;
  -- this match is already on stage: just point the event at it again
  if m.battle_id is not null and exists (select 1 from battles where id = m.battle_id and status = 'live') then
    update events set current_battle_id = m.battle_id where id = e.id;
    return m.battle_id;
  end if;
  if e.current_battle_id is not null and exists (select 1 from battles where id = e.current_battle_id and status = 'live') then
    raise exception 'Finish the battle on stage first.' using errcode = '22023';
  end if;

  insert into battles (challenger_id, opponent_id, status, mode, round_duration_seconds, rounds_per_player,
                       voting_window, starts_at, started_at, host_id, judge_count, judge_vote_seconds, ranked, event_id)
  values (m.a_id, m.b_id, 'live', 'stage', e.battle_round_seconds, e.battle_rounds,
          interval '1 hour', now(), now(), e.host_id, e.judge_count, e.judge_vote_seconds,
          e.ranked and e.approved_at is not null, e.id)
  returning id into bid;
  insert into battle_judges (battle_id, judge_id) select bid, judge_id from event_judges where event_id = e.id and active;

  update event_matches set battle_id = bid where id = m.id;
  update events set current_battle_id = bid where id = e.id;
  return bid;
end $$;

-- No-show: the host gives the match to the battler who is there.
create or replace function public.host_award_match(p_event uuid, p_match uuid, p_winner uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  e events := event_for_host(p_event);
  m event_matches;
begin
  select * into m from event_matches where id = p_match and event_id = e.id for update;
  if m.winner_id is not null then raise exception 'That match is already decided.' using errcode = '22023'; end if;
  if p_winner not in (m.a_id, m.b_id) then raise exception 'Choose one of the two battlers.' using errcode = '22023'; end if;
  if m.battle_id is not null and exists (select 1 from battles where id = m.battle_id and status = 'live') then
    update battles set status = 'cancelled', result = 'no_contest', finished_at = now() where id = m.battle_id;
  end if;
  update event_matches set winner_id = p_winner, walkover = true where id = m.id;
  perform event_progress(e.id);
end $$;

-- -----------------------------------------------------------------------------
-- After every result: create the matches that just became possible,
-- and finish the event when the final and small final are decided.
-- -----------------------------------------------------------------------------
create or replace function public.event_progress(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  e        events;
  k_size   int;      -- players in the knockout part
  k_rounds int;
  r        int;
  m1       event_matches;
  m2       event_matches;
  s        int;
  sw_round int;
  top      uuid[];
begin
  select * into e from events where id = p_event for update;
  if e.status <> 'main' then return; end if;

  -- Swiss part
  if e.main_format = 'swiss' then
    select coalesce(max(round), 0) into sw_round from event_matches where event_id = e.id and phase = 'swiss';
    if sw_round > 0 and not exists (select 1 from event_matches where event_id = e.id and phase = 'swiss' and round = sw_round and winner_id is null) then
      if sw_round < e.swiss_rounds then
        perform create_swiss_round(e.id, sw_round + 1);
        return;
      elsif not exists (select 1 from event_matches where event_id = e.id and phase = 'knockout') then
        select array_agg(profile_id order by pos) into top from (select * from swiss_standings(e.id) limit 4) t;
        perform create_knockout(e.id, top);
        return;
      end if;
    end if;
    k_size := 4;
  else
    k_size := e.advance_count;
  end if;

  -- Knockout part: next round as soon as both feeder matches are decided
  k_rounds := round(log(2, k_size))::int;
  for r in 1 .. k_rounds - 1 loop
    for s in 0 .. (k_size / 2 ^ r)::int / 2 - 1 loop
      select * into m1 from event_matches where event_id = e.id and phase = 'knockout' and round = r and slot = 2 * s;
      select * into m2 from event_matches where event_id = e.id and phase = 'knockout' and round = r and slot = 2 * s + 1;
      if m1.winner_id is not null and m2.winner_id is not null
         and not exists (select 1 from event_matches where event_id = e.id and phase = 'knockout' and round = r + 1 and slot = s) then
        insert into event_matches (event_id, phase, round, slot, a_id, b_id) values (e.id, 'knockout', r + 1, s, m1.winner_id, m2.winner_id);
        -- the semifinal losers meet in the small final
        if r + 1 = k_rounds then
          insert into event_matches (event_id, phase, round, slot, a_id, b_id)
          values (e.id, 'small_final', k_rounds, 0,
                  case when m1.winner_id = m1.a_id then m1.b_id else m1.a_id end,
                  case when m2.winner_id = m2.a_id then m2.b_id else m2.a_id end)
          on conflict do nothing;
        end if;
      end if;
    end loop;
  end loop;

  -- Done?
  select * into m1 from event_matches where event_id = e.id and phase = 'knockout' and round = k_rounds and slot = 0;
  select * into m2 from event_matches where event_id = e.id and phase = 'small_final';
  if m1.winner_id is not null and m2.winner_id is not null then
    perform event_finish(e.id);
  end if;
end $$;

create or replace function public.event_finish(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  e        events;
  k_size   int;
  k_rounds int;
  fin      event_matches;
  sf       event_matches;
  m        event_matches;
  loser    uuid;
  r        record;
  v_pts    int;
  v_season int := current_season_id();
begin
  select * into e from events where id = p_event for update;
  k_size := case when e.main_format = 'swiss' then 4 else e.advance_count end;
  k_rounds := round(log(2, k_size))::int;
  select * into fin from event_matches where event_id = e.id and phase = 'knockout' and round = k_rounds and slot = 0;
  select * into sf from event_matches where event_id = e.id and phase = 'small_final';

  update event_entries set final_place = null where event_id = e.id;
  update event_entries set final_place = 1 where event_id = e.id and profile_id = fin.winner_id;
  update event_entries set final_place = 2 where event_id = e.id and profile_id = case when fin.winner_id = fin.a_id then fin.b_id else fin.a_id end;
  update event_entries set final_place = 3 where event_id = e.id and profile_id = sf.winner_id;
  update event_entries set final_place = 4 where event_id = e.id and profile_id = case when sf.winner_id = sf.a_id then sf.b_id else sf.a_id end;

  if e.main_format = 'knockout' then
    -- losers of earlier rounds share a place: quarterfinal losers 5th, round-of-16 losers 9th...
    for m in select * from event_matches where event_id = e.id and phase = 'knockout' and round <= k_rounds - 2 and winner_id is not null loop
      loser := case when m.winner_id = m.a_id then m.b_id else m.a_id end;
      update event_entries set final_place = (2 ^ (k_rounds - m.round))::int + 1 where event_id = e.id and profile_id = loser;
    end loop;
  else
    for r in select * from swiss_standings(e.id) where pos > 4 loop
      update event_entries set final_place = r.pos where event_id = e.id and profile_id = r.profile_id;
    end loop;
  end if;

  update events set status = 'finished', finished_at = now(), live = false, champion_id = fin.winner_id, current_battle_id = null
   where id = e.id;

  if e.ranked and e.approved_at is not null then
    for r in select profile_id, final_place from event_entries where event_id = e.id and final_place between 1 and 8 loop
      v_pts := case r.final_place when 1 then 1000 when 2 then 500 when 3 then 350 when 4 then 200 else 100 end;
      insert into point_events (profile_id, event_id, reason, points, season_id)
      values (r.profile_id, e.id, 'tournament', v_pts, v_season)
      on conflict do nothing;
      update profiles set total_points = total_points + v_pts, weekly_points = weekly_points + v_pts,
                          season_points = season_points + case when v_season is not null then v_pts else 0 end
       where id = r.profile_id;
    end loop;
  end if;

  perform notify_event_all(e.id, jsonb_build_object('what', 'finished'));
end $$;

-- A finished event battle records its winner in the bracket.
create or replace function public.event_match_result() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m event_matches;
begin
  select * into m from event_matches where battle_id = new.id;
  if not found or m.winner_id is not null or new.winner_id is null then return new; end if;
  update event_matches set winner_id = new.winner_id where id = m.id;
  update events set current_battle_id = null where id = m.event_id and current_battle_id = new.id;
  perform event_progress(m.event_id);
  return new;
end $$;

create trigger battles_event_result after update of status on public.battles
  for each row when (new.status = 'finished' and old.status is distinct from 'finished' and new.event_id is not null)
  execute function public.event_match_result();

revoke execute on function public.create_knockout(uuid, uuid[])  from public, anon, authenticated;
revoke execute on function public.create_swiss_round(uuid, int)   from public, anon, authenticated;
revoke execute on function public.event_progress(uuid)            from public, anon, authenticated;
revoke execute on function public.event_finish(uuid)              from public, anon, authenticated;

alter publication supabase_realtime add table public.event_matches;

-- Leaderboards: "battles" and "wins" count battles only, not tournament placements.
create or replace function public.leaderboard_all(p_period text default 'weekly')
returns table (
  rank bigint, profile_id uuid, username text, full_name text, avatar_url text, country text,
  points bigint, battles bigint, wins bigint, elo_rating integer
)
language sql stable security definer set search_path = public as $$
  with per as (
    select e.profile_id as pid, sum(e.points) as pts,
           count(*) filter (where e.battle_id is not null) as n,
           count(*) filter (where e.reason in ('win', 'forfeit_win')) as w
      from point_events e
     where case p_period
             when 'weekly' then e.created_at >= date_trunc('week', now())
             when 'season' then e.season_id = current_season_id()
             else true
           end
     group by e.profile_id
  )
  select rank() over (order by per.pts desc),
         p.id, p.username, p.full_name, p.avatar_url, p.country::text,
         per.pts, per.n, per.w, p.elo_rating
    from per
    join profiles p on p.id = per.pid
   where p.deleted_at is null;
$$;