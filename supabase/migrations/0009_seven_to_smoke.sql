-- =============================================================================
-- BBX Arena: 7 to Smoke
-- Run ONCE in the Supabase SQL Editor, after 0001 to 0008.
--
-- Up to 8 beatboxers in a line. The first two battle; the winner stays on
-- stage and scores 1 point, the loser goes to the back of the line. The first
-- to 7 points wins. Every battle is a Stage battle with the event judges.
-- It's a main-stage format after the eliminations, or the whole event when 8 or
-- fewer register (the host can skip the eliminations).
-- =============================================================================

alter table public.events drop constraint if exists events_main_format_check;
alter table public.events add constraint events_main_format_check
  check (main_format in ('knockout', 'swiss', 'seven_to_smoke'));
alter table public.events add column smoke_target smallint not null default 7 check (smoke_target between 3 and 10);

alter table public.event_matches drop constraint if exists event_matches_phase_check;
alter table public.event_matches add constraint event_matches_phase_check
  check (phase in ('swiss', 'knockout', 'small_final', 'smoke'));

-- Score and place in line (queue_pos null = on stage)
create table public.event_smoke (
  event_id    uuid not null references public.events (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  points      smallint not null default 0,
  queue_pos   integer,
  primary key (event_id, profile_id)
);
alter table public.event_smoke enable row level security;
create policy "Smoke scores are public" on public.event_smoke for select using (true);

-- Line up the qualified beatboxers (eliminations order) and put the first two on.
create or replace function public.smoke_start(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  line uuid[];
begin
  select array_agg(profile_id order by elim_place) into line
    from event_entries where event_id = p_event and status = 'qualified';
  if cardinality(line) < 3 then
    raise exception '7 to Smoke needs at least 3 beatboxers.' using errcode = '22023';
  end if;
  insert into event_smoke (event_id, profile_id, queue_pos)
  select p_event, u, case when o <= 2 then null else o end from unnest(line) with ordinality as t(u, o);
  insert into event_matches (event_id, phase, round, slot, a_id, b_id) values (p_event, 'smoke', 1, 0, line[1], line[2]);
end $$;

-- After each result: a point for the winner, the loser to the back of the line,
-- then the winner faces the front of the line, until someone reaches the target.
create or replace function public.smoke_progress(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  e     events;
  m     event_matches;
  loser uuid;
  nxt   uuid;
  pts   int;
begin
  select * into e from events where id = p_event;
  select * into m from event_matches where event_id = p_event and phase = 'smoke' order by round desc limit 1;
  if m.winner_id is null then return; end if;
  -- already applied?
  if exists (select 1 from event_matches where event_id = p_event and phase = 'smoke' and round = m.round + 1) then return; end if;

  loser := case when m.winner_id = m.a_id then m.b_id else m.a_id end;
  update event_smoke set points = points + 1, queue_pos = null where event_id = p_event and profile_id = m.winner_id
  returning points into pts;
  update event_smoke set queue_pos = coalesce((select max(queue_pos) from event_smoke where event_id = p_event), 0) + 1
   where event_id = p_event and profile_id = loser;

  if pts >= e.smoke_target then
    perform event_finish(p_event);
    return;
  end if;

  select profile_id into nxt from event_smoke where event_id = p_event and queue_pos is not null order by queue_pos limit 1;
  update event_smoke set queue_pos = null where event_id = p_event and profile_id = nxt;
  insert into event_matches (event_id, phase, round, slot, a_id, b_id) values (p_event, 'smoke', m.round + 1, 0, m.winner_id, nxt);
end $$;

-- Small events: skip the eliminations and line everyone up in a random order.
create or replace function public.host_skip_eliminations(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  e events := event_for_host(p_event);
  n int;
begin
  if e.status <> 'registration' then raise exception 'Registration has already closed.' using errcode = '22023'; end if;
  if e.main_format <> 'seven_to_smoke' then
    raise exception 'Only 7 to Smoke events can skip the eliminations.' using errcode = '22023';
  end if;
  select count(*) into n from event_entries where event_id = e.id and status = 'registered';
  if n < 3 or n > 8 then
    raise exception 'Skipping the eliminations needs 3 to 8 registered beatboxers (now %).', n using errcode = '22023';
  end if;
  update event_entries x set status = 'qualified', elim_place = o.rn
    from (select profile_id, row_number() over (order by random()) as rn
            from event_entries where event_id = e.id and status = 'registered') o
   where x.event_id = e.id and x.profile_id = o.profile_id;
  update events set status = 'main', published_at = now(), live = true, advance_count = least(e.advance_count, 8)
   where id = e.id;
  perform notify_event_all(e.id, jsonb_build_object('what', 'resumed'));
end $$;

revoke execute on function public.smoke_start(uuid)    from public, anon, authenticated;
revoke execute on function public.smoke_progress(uuid) from public, anon, authenticated;

alter publication supabase_realtime add table public.event_smoke;

-- Bracket, progress and finish now know about 7 to Smoke.
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
  if e.main_format = 'seven_to_smoke' then
    perform smoke_start(e.id);
  elsif e.main_format = 'knockout' then
    select array_agg(profile_id order by elim_place) into players
      from event_entries where event_id = e.id and status = 'qualified';
    perform create_knockout(e.id, players);
  else
    update events set swiss_rounds = greatest(2, round(log(2, e.advance_count))::int) where id = e.id;
    perform create_swiss_round(e.id, 1);
  end if;
end $$;

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
  if e.main_format = 'seven_to_smoke' then
    perform smoke_progress(e.id);
    return;
  end if;

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