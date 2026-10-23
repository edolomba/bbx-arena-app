-- =============================================================================
-- Beatbox Arena: Tag Team categories in events, part 3
-- Run ONCE in the Supabase SQL Editor, after 0001 to 0022.
--
-- A category can be Solo or Tag Team. Tag Team categories take fixed Tag Teams
-- only: the entry is in the name of one member and carries the team and the
-- partner, so eliminations, the official classification, knockout, Swiss and
-- 7 to Smoke work unchanged. Showcases are performed by both members (each
-- uploads their take; the mix is the showcase), matches are 2v2 battles, and
-- both members get full tournament points and badges, as does the Tag Team.
-- =============================================================================

alter table public.events add column kind text not null default 'solo' check (kind in ('solo', 'tag'));
alter table public.event_entries
  add column team_id    uuid references public.teams (id),
  add column partner_id uuid references public.profiles (id);

create table public.event_showcase_parts (
  event_id       uuid not null references public.events (id) on delete cascade,
  entry_profile  uuid not null references public.profiles (id),
  profile_id     uuid not null references public.profiles (id),
  audio_path     text not null,
  duration_ms    int  not null,
  created_at     timestamptz not null default now(),
  primary key (event_id, entry_profile, profile_id)
);
alter table public.event_showcase_parts enable row level security;
create policy "Showcase parts are public" on public.event_showcase_parts for select using (true);

create table public.team_event_points (
  team_id    uuid not null references public.teams (id) on delete cascade,
  event_id   uuid not null references public.events (id) on delete cascade,
  points     int  not null,
  created_at timestamptz not null default now(),
  primary key (team_id, event_id)
);
alter table public.team_event_points enable row level security;
create policy "Team event points are public" on public.team_event_points for select using (true);

drop function if exists public.create_category(uuid, text, text, int, int, text[], int, text, int, int, int, int, boolean);

/** Register a fixed Tag Team in a Tag Team category (either member does it). */
create or replace function public.register_event_team(p_event uuid, p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  e      events;
  v_pair uuid[];
begin
  if v_uid is null then raise exception 'Sign in to register.' using errcode = '28000'; end if;
  select * into e from events where id = p_event for update;
  if not found then raise exception 'This event doesn''t exist.' using errcode = 'P0002'; end if;
  if e.kind <> 'tag' then raise exception 'This is a Solo category.' using errcode = '22023'; end if;
  if e.status <> 'registration' or now() > e.registration_closes_at then raise exception 'Registration is closed.' using errcode = '22023'; end if;
  v_pair := team_pair(p_team);
  if v_pair is null or cardinality(v_pair) <> 2 or not (v_uid = any (v_pair)) then
    raise exception 'That isn''t one of your active Tag Teams.' using errcode = '42501';
  end if;
  if e.host_id = any (v_pair) or exists (select 1 from event_judges where event_id = e.id and active and judge_id = any (v_pair)) then
    raise exception 'Hosts and judges can''t compete in their own event.' using errcode = '22023';
  end if;
  if exists (select 1 from profiles where id = any (v_pair) and (suspended_at is not null or deleted_at is not null)) then
    raise exception 'A member of this Tag Team is suspended.' using errcode = '42501';
  end if;
  if exists (select 1 from event_entries where event_id = e.id and status in ('registered', 'qualified')
               and (profile_id = any (v_pair) or partner_id = any (v_pair))) then
    raise exception 'A member of this Tag Team is already registered in this category.' using errcode = '23505';
  end if;
  if (select count(*) from event_entries where event_id = e.id and status = 'registered') >= e.max_participants then
    raise exception 'This event is full.' using errcode = '54000';
  end if;
  insert into event_entries (event_id, profile_id, team_id, partner_id) values (e.id, v_pair[1], p_team, v_pair[2])
  on conflict (event_id, profile_id) do update set status = 'registered', team_id = excluded.team_id, partner_id = excluded.partner_id
   where event_entries.status = 'withdrawn';
  if not found then raise exception 'You''re already registered.' using errcode = '23505'; end if;
end $$;

/** Withdraw (either Tag Team member can). */
create or replace function public.withdraw_event(p_event uuid) returns void
language sql security definer set search_path = public as $$
  update event_entries set status = 'withdrawn'
   where event_id = p_event and (profile_id = auth.uid() or partner_id = auth.uid()) and status = 'registered'
     and exists (select 1 from events e where e.id = p_event and e.status = 'registration');
$$;

/** Tag Team showcase: each member's own take of the showcase their team just performed. */
create or replace function public.submit_showcase_part(p_event uuid, p_audio_path text, p_duration_ms int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  e       events;
  v_owner uuid;
begin
  select * into e from events where id = p_event;
  if not found or e.kind <> 'tag' then raise exception 'This isn''t a Tag Team category.' using errcode = '22023'; end if;
  select profile_id into v_owner from event_entries
   where event_id = e.id and (profile_id = v_uid or partner_id = v_uid) and status in ('registered', 'qualified');
  if v_owner is null or e.stage_profile is distinct from v_owner or now() < e.stage_started_at or now() > e.stage_ends_at + interval '30 minutes' then
    raise exception 'Showcases upload right after your turn on stage.' using errcode = '22023';
  end if;
  if p_audio_path not like ('event-' || e.id::text || '/' || v_uid::text || '/%')
     or not exists (select 1 from storage.objects where bucket_id = 'battle-audio' and name = p_audio_path) then
    raise exception 'Upload the audio file first.' using errcode = 'P0002';
  end if;
  insert into event_showcase_parts (event_id, entry_profile, profile_id, audio_path, duration_ms)
  values (e.id, v_owner, v_uid, p_audio_path, p_duration_ms)
  on conflict (event_id, entry_profile, profile_id) do update set audio_path = excluded.audio_path, duration_ms = excluded.duration_ms, created_at = now();
end $$;

create or replace function public.create_category(
  p_group                  uuid,
  p_category               text,
  p_audience               text,
  p_max_participants       int,
  p_advance_count          int,
  p_judges                 text[],
  p_registration_hours     int     default 72,
  p_main_format            text    default 'knockout',
  p_showcase_seconds       int     default 60,
  p_battle_round_seconds   int     default 45,
  p_battle_rounds          int     default 1,
  p_judge_vote_seconds     int     default 15,
  p_ranked                 boolean default false,
  p_kind                   text    default 'solo'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  g    event_groups := event_group_for_host(p_group);
  v_id uuid;
begin
  if char_length(btrim(coalesce(p_category, ''))) not between 1 and 40 then
    raise exception 'Give the category a name (up to 40 characters).' using errcode = '22023';
  end if;
  if (select count(*) from events where group_id = g.id) >= 12 then
    raise exception 'An event can have up to 12 categories.' using errcode = '22023';
  end if;
  v_id := create_event(
    left(g.name || coalesce(' ' || g.edition, '') || ' · ' || btrim(p_category), 80),
    p_max_participants, p_advance_count, p_judges, p_registration_hours, null, p_main_format,
    p_showcase_seconds, p_battle_round_seconds, p_battle_rounds, p_judge_vote_seconds, p_ranked);
  if p_kind not in ('solo', 'tag') then raise exception 'A category is Solo or Tag Team.' using errcode = '22023'; end if;
  update events set group_id = g.id, category_name = btrim(p_category), audience = nullif(btrim(p_audience), ''), kind = p_kind
   where id = v_id;
  return v_id;
end $$;

create or replace function public.register_event(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  e     events;
begin
  if v_uid is null then raise exception 'Sign in to register.' using errcode = '28000'; end if;
  select * into e from events where id = p_event for update;
  if not found then raise exception 'This event doesn''t exist.' using errcode = 'P0002'; end if;
  if e.kind = 'tag' then raise exception 'This is a Tag Team category: register with your Tag Team.' using errcode = '22023'; end if;
  if e.status <> 'registration' or now() > e.registration_closes_at then
    raise exception 'Registration is closed.' using errcode = '22023';
  end if;
  if v_uid = e.host_id or exists (select 1 from event_judges where event_id = e.id and judge_id = v_uid and active) then
    raise exception 'Hosts and judges can''t compete in their own event.' using errcode = '22023';
  end if;
  if exists (select 1 from profiles where id = v_uid and (suspended_at is not null or deleted_at is not null)) then
    raise exception 'This account is suspended.' using errcode = '42501';
  end if;
  if (select count(*) from event_entries where event_id = e.id and status = 'registered') >= e.max_participants then
    raise exception 'This event is full.' using errcode = '54000';
  end if;
  insert into event_entries (event_id, profile_id) values (e.id, v_uid)
  on conflict (event_id, profile_id) do update set status = 'registered'
   where event_entries.status = 'withdrawn';
  if not found then raise exception 'You''re already registered.' using errcode = '23505'; end if;
end $$;

create or replace function public.submit_showcase(
  p_event uuid, p_audio_path text, p_duration_ms int, p_waveform jsonb,
  p_lufs real default null, p_peak_dbfs real default null, p_sub_ratio real default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  e       events;
  v_owner uuid;
begin
  select * into e from events where id = p_event;
  if not found then raise exception 'This event doesn''t exist.' using errcode = 'P0002'; end if;
  if e.kind = 'tag' then
    -- the Tag Team's mixed showcase, by either member, once both (or one) member takes are in
    select profile_id into v_owner from event_entries
     where event_id = e.id and (profile_id = v_uid or partner_id = v_uid) and status in ('registered', 'qualified');
    if v_owner is null or not exists (select 1 from event_showcase_parts where event_id = e.id and entry_profile = v_owner) then
      raise exception 'Showcases upload right after your turn on stage.' using errcode = '22023';
    end if;
  elsif e.stage_profile is distinct from v_uid or now() < e.stage_started_at or now() > e.stage_ends_at + interval '30 minutes' then
    raise exception 'Showcases upload right after your turn on stage.' using errcode = '22023';
  end if;
  if p_audio_path not like ('event-' || e.id::text || '/' || v_uid::text || '/%') then
    raise exception 'The audio file is in the wrong folder.' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'battle-audio' and name = p_audio_path) then
    raise exception 'Upload the audio file first.' using errcode = 'P0002';
  end if;
  if p_duration_ms < 3000 or p_duration_ms > e.showcase_seconds * 1000 + 500 then
    raise exception 'Showcases are up to % seconds.', e.showcase_seconds using errcode = '22023';
  end if;
  insert into event_showcases (event_id, profile_id, audio_path, duration_ms, waveform_data, integrated_lufs, peak_dbfs, sub_ratio)
  values (e.id, coalesce(v_owner, v_uid), p_audio_path, p_duration_ms, p_waveform, p_lufs, p_peak_dbfs, p_sub_ratio)
  on conflict (event_id, profile_id) do update set audio_path = excluded.audio_path, duration_ms = excluded.duration_ms,
    waveform_data = excluded.waveform_data, integrated_lufs = excluded.integrated_lufs, peak_dbfs = excluded.peak_dbfs,
    sub_ratio = excluded.sub_ratio, submitted_at = now();
end $$;

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
  -- Tag Team categories: the match is a 2v2 between the two registered Tag Teams
  if e.kind = 'tag' then
    update battles b set format = 'tag', tag_accepted = true,
           challenger_partner_id = xa.partner_id, challenger_team_id = xa.team_id,
           opponent_partner_id = xb.partner_id, opponent_team_id = xb.team_id
      from event_entries xa, event_entries xb
     where b.id = bid and xa.event_id = e.id and xa.profile_id = m.a_id and xb.event_id = e.id and xb.profile_id = m.b_id;
  end if;

  update event_matches set battle_id = bid where id = m.id;
  update events set current_battle_id = bid where id = e.id;
  return bid;
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
  update event_entries set final_place = null where event_id = e.id;

  if e.main_format = 'seven_to_smoke' then
    -- most points first; equal points: the better eliminations place
    update event_entries x set final_place = rk.place
      from (select s.profile_id, (rank() over (order by s.points desc, x2.elim_place))::int as place
              from event_smoke s join event_entries x2 on x2.event_id = s.event_id and x2.profile_id = s.profile_id
             where s.event_id = e.id) rk
     where x.event_id = e.id and x.profile_id = rk.profile_id;
    update events set status = 'finished', finished_at = now(), live = false, current_battle_id = null,
           champion_id = (select profile_id from event_entries where event_id = e.id and final_place = 1 limit 1)
     where id = e.id;
  else
  k_size := case when e.main_format = 'swiss' then 4 else e.advance_count end;
  k_rounds := round(log(2, k_size))::int;
  select * into fin from event_matches where event_id = e.id and phase = 'knockout' and round = k_rounds and slot = 0;
  select * into sf from event_matches where event_id = e.id and phase = 'small_final';

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
  end if;

  if e.ranked and e.approved_at is not null then
    -- Tag Team categories: both members get the full points, and so does the Tag Team
    for r in select x.team_id, x.final_place from event_entries x where x.event_id = e.id and x.team_id is not null and x.final_place between 1 and 8 loop
      v_pts := case r.final_place when 1 then 1000 when 2 then 500 when 3 then 350 when 4 then 200 else 100 end;
      insert into team_event_points (team_id, event_id, points) values (r.team_id, e.id, v_pts) on conflict do nothing;
      if found then update teams set total_points = total_points + v_pts where id = r.team_id; end if;
    end loop;
    for r in select profile_id, final_place from event_entries where event_id = e.id and final_place between 1 and 8
             union all
             select partner_id, final_place from event_entries where event_id = e.id and partner_id is not null and final_place between 1 and 8 loop
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

create or replace function public.check_event_badges(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  e      events;
  ctx    jsonb;
  r      record;
  last_n int;
begin
  select * into e from events where id = p_event;
  ctx := jsonb_build_object('event_id', e.id, 'event', e.title);

  -- only when there really were eliminations (skipped ones just draw the order)
  if e.published_at is not null and exists (select 1 from event_showcases where event_id = e.id) then
    for r in select profile_id from event_entries where event_id = e.id and elim_place = 1
             union all select partner_id from event_entries where event_id = e.id and elim_place = 1 and partner_id is not null loop
      perform award_badge(r.profile_id, 'showcase_star', e.id::text, ctx);
    end loop;
  end if;

  if e.status <> 'finished' then return; end if;

  perform award_badge(e.host_id, 'host', e.id::text, ctx);
  for r in select judge_id from event_judges where event_id = e.id and active loop
    perform award_badge(r.judge_id, 'judge', e.id::text, ctx);
    if (select count(distinct j.event_id) from event_judges j join events x on x.id = j.event_id
         where j.judge_id = r.judge_id and j.active and x.status = 'finished') >= 10 then
      perform award_badge(r.judge_id, 'golden_ear');
    end if;
  end loop;

  for r in select profile_id, final_place from event_entries where event_id = e.id and final_place between 1 and 3
           union all select partner_id, final_place from event_entries where event_id = e.id and final_place between 1 and 3 and partner_id is not null loop
    perform award_badge(r.profile_id, 'podium', e.id::text, ctx);
    if r.final_place = 1 then
      perform award_badge(r.profile_id, case when e.main_format = 'seven_to_smoke' then 'last_one_standing' else 'headliner' end, e.id::text, ctx);
    end if;
  end loop;

  -- Perfect Seven: the champion's last N battles were all wins (N = the target)
  if e.main_format = 'seven_to_smoke' and e.champion_id is not null then
    select count(*) into last_n from (
      select winner_id from event_matches where event_id = e.id and phase = 'smoke' and winner_id is not null
       order by round desc limit e.smoke_target
    ) t where t.winner_id = e.champion_id;
    if last_n = e.smoke_target then
      perform award_badge(e.champion_id, 'perfect_seven', e.id::text, ctx);
      perform award_badge(x.partner_id, 'perfect_seven', e.id::text, ctx)
         from event_entries x where x.event_id = e.id and x.profile_id = e.champion_id and x.partner_id is not null;
    end if;
  end if;
end $$;

create or replace function public.room_access(p_kind text, p_room uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then return 'audience'; end if;
  select role into v_role from room_roles where room_kind = p_kind and room_id = p_room and profile_id = v_uid;
  if p_kind = 'battle' then
    if exists (select 1 from battles where id = p_room and host_id = v_uid) then return 'host'; end if;
    if exists (select 1 from battles where id = p_room and v_uid in (challenger_id, opponent_id, challenger_partner_id, opponent_partner_id)) then return 'battler'; end if;
    if exists (select 1 from battle_judges where battle_id = p_room and judge_id = v_uid and active) then return 'judge'; end if;
  else
    if exists (select 1 from events where id = p_room and host_id = v_uid) then return 'host'; end if;
    if exists (select 1 from event_judges where event_id = p_room and judge_id = v_uid and active) then return 'judge'; end if;
    if exists (select 1 from event_entries where event_id = p_room and (profile_id = v_uid or partner_id = v_uid) and status in ('registered', 'qualified')) then return 'battler'; end if;
  end if;
  return coalesce(v_role, 'audience');
end $$;
