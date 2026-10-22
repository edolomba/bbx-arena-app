-- =============================================================================
-- Beatbox Arena: Tag Teams (fixed duos), part 1
-- Run ONCE in the Supabase SQL Editor, after 0001 to 0019.
--
-- A fixed duo has a name, two members (the second accepts an invitation), its
-- own page, rating and ranking points. Each person can be in up to 3 duos.
-- (2v2 battles and Tag Team event categories come in the next parts.)
-- =============================================================================

alter type public.notification_kind add value if not exists 'team_invite';
alter type public.notification_kind add value if not exists 'team_update';

create table public.teams (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(btrim(name)) between 2 and 40),
  status         text not null default 'pending' check (status in ('pending', 'active', 'disbanded')),
  created_by     uuid references public.profiles (id) on delete set null,
  elo_rating     int not null default 1200,
  peak_elo       int not null default 1200,
  wins           int not null default 0,
  losses         int not null default 0,
  draws          int not null default 0,
  battles_count  int generated always as (wins + losses + draws) stored,
  total_points   int not null default 0,
  weekly_points  int not null default 0,
  season_points  int not null default 0,
  created_at     timestamptz not null default now(),
  disbanded_at   timestamptz
);
-- Names are unique among teams that still exist.
create unique index teams_name_uq on public.teams (lower(btrim(name))) where status <> 'disbanded';

create table public.team_members (
  team_id     uuid not null references public.teams (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  status      text not null default 'invited' check (status in ('invited', 'active', 'left')),
  joined_at   timestamptz,
  primary key (team_id, profile_id)
);
create index team_members_profile_idx on public.team_members (profile_id, status);

alter table public.teams        enable row level security;
alter table public.team_members enable row level security;
create policy "Teams are public"        on public.teams        for select using (true);
create policy "Team members are public" on public.team_members for select using (true);

create or replace function public.active_team_count(p_profile uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from team_members m join teams t on t.id = m.team_id
   where m.profile_id = p_profile and m.status in ('active', 'invited') and t.status <> 'disbanded';
$$;

/** Create a duo and invite the partner. */
create or replace function public.create_team(p_name text, p_partner text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_partner uuid;
  v_id      uuid;
begin
  if v_uid is null then raise exception 'Log in first.' using errcode = '28000'; end if;
  select id into v_partner from profiles where lower(username) = lower(btrim(p_partner, ' @')) and deleted_at is null;
  if v_partner is null then raise exception 'No beatboxer is called @%.', btrim(p_partner, ' @') using errcode = 'P0002'; end if;
  if v_partner = v_uid then raise exception 'Pick someone else as your partner.' using errcode = '22023'; end if;
  if active_team_count(v_uid) >= 3 then raise exception 'You’re already in 3 Tag Teams.' using errcode = '22023'; end if;
  if active_team_count(v_partner) >= 3 then raise exception '@% is already in 3 Tag Teams.', btrim(p_partner, ' @') using errcode = '22023'; end if;
  if exists (select 1 from teams t where t.status <> 'disbanded'
               and exists (select 1 from team_members a where a.team_id = t.id and a.profile_id = v_uid and a.status <> 'left')
               and exists (select 1 from team_members b where b.team_id = t.id and b.profile_id = v_partner and b.status <> 'left')) then
    raise exception 'You already have a Tag Team with @%.', btrim(p_partner, ' @') using errcode = '22023';
  end if;
  begin
    insert into teams (name, created_by) values (btrim(p_name), v_uid) returning id into v_id;
  exception when unique_violation then
    raise exception 'That Tag Team name is taken.' using errcode = '23505';
  end;
  insert into team_members (team_id, profile_id, status, joined_at) values (v_id, v_uid, 'active', now()), (v_id, v_partner, 'invited', null);
  perform notify(v_partner, 'team_invite', null, v_uid, jsonb_build_object('team_id', v_id, 'team', btrim(p_name)));
  return v_id;
end $$;

/** The invited partner accepts (the duo becomes active) or declines (the duo is dropped). */
create or replace function public.answer_team_invite(p_team uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  t     teams;
begin
  select * into t from teams where id = p_team for update;
  if not found or t.status <> 'pending' then raise exception 'This invitation is no longer open.' using errcode = '22023'; end if;
  if not exists (select 1 from team_members where team_id = p_team and profile_id = v_uid and status = 'invited') then
    raise exception 'This invitation isn’t for you.' using errcode = '42501';
  end if;
  if p_accept then
    if active_team_count(v_uid) > 3 then raise exception 'You’re already in 3 Tag Teams.' using errcode = '22023'; end if;
    update team_members set status = 'active', joined_at = now() where team_id = p_team and profile_id = v_uid;
    update teams set status = 'active' where id = p_team;
  else
    update teams set status = 'disbanded', disbanded_at = now() where id = p_team;
    update team_members set status = 'left' where team_id = p_team;
  end if;
  perform notify(t.created_by, 'team_update', null, v_uid, jsonb_build_object('team_id', p_team, 'team', t.name, 'what', case when p_accept then 'accepted' else 'declined' end));
end $$;

/** Either member renames the duo. */
create or replace function public.rename_team(p_team uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from team_members m join teams t on t.id = m.team_id
                  where m.team_id = p_team and m.profile_id = auth.uid() and m.status = 'active' and t.status = 'active') then
    raise exception 'Only members can rename the Tag Team.' using errcode = '42501';
  end if;
  begin
    update teams set name = btrim(p_name) where id = p_team;
  exception when unique_violation then
    raise exception 'That Tag Team name is taken.' using errcode = '23505';
  end;
end $$;

/** Either member breaks the duo up. Its results stay on record. */
create or replace function public.leave_team(p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  t       teams;
  v_other uuid;
begin
  select * into t from teams where id = p_team for update;
  if not found or t.status = 'disbanded' then raise exception 'This Tag Team no longer exists.' using errcode = '22023'; end if;
  if not exists (select 1 from team_members where team_id = p_team and profile_id = v_uid and status <> 'left') then
    raise exception 'You’re not in this Tag Team.' using errcode = '42501';
  end if;
  select profile_id into v_other from team_members where team_id = p_team and profile_id <> v_uid limit 1;
  update teams set status = 'disbanded', disbanded_at = now() where id = p_team;
  update team_members set status = 'left' where team_id = p_team;
  perform notify(v_other, 'team_update', null, v_uid, jsonb_build_object('team_id', p_team, 'team', t.name, 'what', 'disbanded'));
end $$;

/** Tag Team ranking by rating, with members. */
create or replace function public.team_board(p_limit int default 100)
returns table (rank int, team_id uuid, name text, elo int, peak int, wins int, losses int, draws int, battles int, total_points int,
               members jsonb)
language sql stable security definer set search_path = public as $$
  select (rank() over (order by t.elo_rating desc, t.wins desc, t.created_at))::int, t.id, t.name, t.elo_rating, t.peak_elo,
         t.wins, t.losses, t.draws, t.battles_count, t.total_points,
         (select jsonb_agg(jsonb_build_object('username', p.username, 'avatar_url', p.avatar_url, 'country', p.country) order by m.joined_at)
            from team_members m join profiles p on p.id = m.profile_id
           where m.team_id = t.id and m.status = 'active')
    from teams t
   where t.status = 'active'
   order by 1, t.name
   limit greatest(1, least(p_limit, 500));
$$;
grant execute on function public.team_board(int) to anon, authenticated;
revoke execute on function public.active_team_count(uuid) from public, anon, authenticated;
