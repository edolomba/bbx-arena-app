-- =============================================================================
-- BBX Arena: points and leaderboards (weekly, season, all time)
--
-- Run this file ONCE in the Supabase SQL Editor, after 0001_init.sql.
--
-- Rules (editable in the scoring_rules table, no code changes needed):
--   win          +100   won by votes
--   loss          +20   lost by votes (the loser delivered their audio)
--   draw          +50   tie on votes
--   forfeit       -50   didn't deliver a round in time (W.O.)
--   forfeit_win  +100   opponent forfeited
--   no contest      0   nobody voted: nobody judged it, so nobody scores
--   Votes never give points to the voter.
--
-- Every award is a row in point_events (the ledger). total_points,
-- weekly_points and season_points on profiles are kept in sync with it:
-- a trigger adds points the moment a battle finishes, and refresh_points()
-- recomputes everything from the ledger every hour, which is also what
-- resets the weekly total each Monday 00:00 UTC and the season total when a
-- new season starts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Rules (single row)
-- -----------------------------------------------------------------------------
create table public.scoring_rules (
  id           boolean primary key default true check (id),
  win          integer not null default 100,
  loss         integer not null default 20,
  draw         integer not null default 50,
  forfeit      integer not null default -50,
  forfeit_win  integer not null default 100,
  updated_at   timestamptz not null default now()
);
insert into public.scoring_rules default values;

-- -----------------------------------------------------------------------------
-- Seasons (calendar quarters to start; add or rename rows in the Table Editor)
-- -----------------------------------------------------------------------------
create table public.seasons (
  id         serial primary key,
  name       text not null,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  check (ends_at > starts_at)
);
insert into public.seasons (name, starts_at, ends_at) values
  ('Season 1', '2026-10-01 00:00+00', '2027-01-01 00:00+00'),
  ('Season 2', '2027-01-01 00:00+00', '2027-04-01 00:00+00'),
  ('Season 3', '2027-04-01 00:00+00', '2027-07-01 00:00+00'),
  ('Season 4', '2027-07-01 00:00+00', '2027-10-01 00:00+00');

create or replace function public.current_season_id(p_at timestamptz default now()) returns integer
language sql stable set search_path = public as $$
  select id from seasons where p_at >= starts_at and p_at < ends_at order by starts_at desc limit 1;
$$;

-- -----------------------------------------------------------------------------
-- Ledger
-- -----------------------------------------------------------------------------
create type public.point_reason as enum ('win', 'loss', 'draw', 'forfeit', 'forfeit_win');

create table public.point_events (
  id          bigint generated always as identity primary key,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  battle_id   uuid not null references public.battles (id) on delete cascade,
  reason      public.point_reason not null,
  points      integer not null,
  season_id   integer references public.seasons (id),
  created_at  timestamptz not null default now(),
  unique (profile_id, battle_id)                       -- one award per player per battle, ever
);
create index point_events_created_idx on public.point_events (created_at, profile_id);
create index point_events_season_idx  on public.point_events (season_id, profile_id);

alter table public.profiles
  add column total_points  integer not null default 0,
  add column weekly_points integer not null default 0,
  add column season_points integer not null default 0;

create index profiles_total_points_idx  on public.profiles (total_points desc);
create index profiles_weekly_points_idx on public.profiles (weekly_points desc);
create index profiles_season_points_idx on public.profiles (season_points desc);

-- What a finished battle means for one of its two players.
create or replace function public.point_reason_for(b public.battles, p_profile uuid) returns public.point_reason
language sql immutable as $$
  select case
    when b.result = 'draw' then 'draw'
    when b.result = 'forfeit' and p_profile = b.forfeited_by then 'forfeit'
    when b.result = 'forfeit' then 'forfeit_win'
    when p_profile = b.winner_id then 'win'
    else 'loss'
  end::public.point_reason;
$$;

create or replace function public.points_for(p_reason public.point_reason) returns integer
language sql stable set search_path = public as $$
  select case p_reason
    when 'win' then win when 'loss' then loss when 'draw' then draw
    when 'forfeit' then forfeit else forfeit_win end
  from scoring_rules limit 1;
$$;

-- -----------------------------------------------------------------------------
-- Trigger: award points the moment a battle becomes 'finished'
-- -----------------------------------------------------------------------------
create or replace function public.award_battle_points() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_at     timestamptz := coalesce(new.finished_at, now());
  v_season integer := current_season_id(v_at);
begin
  if new.result is null or new.result = 'no_contest' or new.opponent_id is null then
    return new;
  end if;

  with sides(pid) as (values (new.challenger_id), (new.opponent_id)),
  ins as (
    insert into point_events (profile_id, battle_id, reason, points, season_id, created_at)
    select pid, new.id, point_reason_for(new, pid), points_for(point_reason_for(new, pid)), v_season, v_at
      from sides
    on conflict (profile_id, battle_id) do nothing
    returning profile_id, points, created_at, season_id
  )
  update profiles p set
    total_points  = p.total_points + ins.points,
    weekly_points = p.weekly_points + case when ins.created_at >= date_trunc('week', now()) then ins.points else 0 end,
    season_points = p.season_points + case when ins.season_id is not null and ins.season_id = current_season_id() then ins.points else 0 end
  from ins
  where p.id = ins.profile_id;

  return new;
end $$;

create trigger battles_award_points
after update of status on public.battles
for each row
when (new.status = 'finished' and old.status is distinct from 'finished')
execute function public.award_battle_points();

-- -----------------------------------------------------------------------------
-- Recompute every profile's three totals from the ledger. Runs hourly; this is
-- also what zeroes weekly points on Monday and season points at a new season.
-- -----------------------------------------------------------------------------
create or replace function public.refresh_points() returns void
language sql security definer set search_path = public as $$
  update profiles p set
    total_points  = a.total,
    weekly_points = a.weekly,
    season_points = a.season
  from (
    select pr.id,
           coalesce(sum(e.points), 0)::int as total,
           coalesce(sum(e.points) filter (where e.created_at >= date_trunc('week', now())), 0)::int as weekly,
           coalesce(sum(e.points) filter (where e.season_id = current_season_id()), 0)::int as season
      from profiles pr
      left join point_events e on e.profile_id = pr.id
     group by pr.id
  ) a
  where a.id = p.id
    and (p.total_points, p.weekly_points, p.season_points) is distinct from (a.total, a.weekly, a.season);
$$;

select cron.schedule('bbx-refresh-points', '0 * * * *', $$select public.refresh_points()$$);

-- -----------------------------------------------------------------------------
-- Leaderboards. Points come straight from the ledger, so a board is correct
-- even in the minutes between a period boundary and the hourly refresh.
--   p_period: 'weekly' | 'season' | 'all'
-- Only players with at least one finished battle in the period appear.
-- Ties share a rank (1, 2, 2, 4).
-- -----------------------------------------------------------------------------
create or replace function public.leaderboard_all(p_period text default 'weekly')
returns table (
  rank        bigint,
  profile_id  uuid,
  username    text,
  full_name   text,
  avatar_url  text,
  country     text,
  points      bigint,
  battles     bigint,
  wins        bigint,
  elo_rating  integer
)
language sql stable security definer set search_path = public as $$
  with per as (
    select e.profile_id as pid,
           sum(e.points) as pts,
           count(*) as n,
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
    join profiles p on p.id = per.pid;
$$;

create or replace function public.leaderboard(p_period text default 'weekly', p_limit integer default 100, p_offset integer default 0)
returns table (
  rank bigint, profile_id uuid, username text, full_name text, avatar_url text, country text,
  points bigint, battles bigint, wins bigint, elo_rating integer
)
language sql stable security definer set search_path = public as $$
  select * from leaderboard_all(p_period) l
   order by l.rank, l.wins desc, l.username
   limit greatest(1, least(p_limit, 500)) offset greatest(0, p_offset);
$$;

-- The signed-in player's own row, wherever they are on the board.
create or replace function public.my_leaderboard_position(p_period text default 'weekly')
returns table (
  rank bigint, profile_id uuid, username text, full_name text, avatar_url text, country text,
  points bigint, battles bigint, wins bigint, elo_rating integer
)
language sql stable security definer set search_path = public as $$
  select * from leaderboard_all(p_period) l where l.profile_id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- Security: everyone can read (transparency), nobody can write from the API.
-- -----------------------------------------------------------------------------
alter table public.scoring_rules enable row level security;
alter table public.seasons       enable row level security;
alter table public.point_events  enable row level security;
create policy "Scoring rules are public" on public.scoring_rules for select using (true);
create policy "Seasons are public"       on public.seasons       for select using (true);
create policy "Point history is public"  on public.point_events  for select using (true);

revoke execute on function public.award_battle_points() from public, anon, authenticated;
revoke execute on function public.refresh_points()      from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Backfill: award points for battles that finished before this migration.
-- -----------------------------------------------------------------------------
insert into public.point_events (profile_id, battle_id, reason, points, season_id, created_at)
select s.pid, b.id,
       public.point_reason_for(b, s.pid),
       public.points_for(public.point_reason_for(b, s.pid)),
       public.current_season_id(b.finished_at),
       coalesce(b.finished_at, b.created_at)
  from public.battles b
  cross join lateral (values (b.challenger_id), (b.opponent_id)) as s(pid)
 where b.status = 'finished'
   and b.result in ('decision', 'draw', 'forfeit')
   and b.opponent_id is not null
on conflict (profile_id, battle_id) do nothing;

select public.refresh_points();
