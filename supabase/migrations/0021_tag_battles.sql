-- =============================================================================
-- Beatbox Arena: Tag Team battles (2v2, take turns), part 2a
-- Run ONCE in the Supabase SQL Editor, after 0001 to 0020.
--
-- Four seats: a captain and a partner on each side. A side is a fixed Tag Team
-- or a casual duo (the partner seat can stay open for anyone to join). The
-- battle starts when all four seats are taken. Each team round is recorded in
-- two layers: one member records the first part, the other records over it,
-- and the mix is the team's round. Votes, rating and points work as in 1v1:
-- the rating uses each side's average and moves for all four members (and for
-- fixed teams); points go to all four members and to fixed teams.
-- =============================================================================

alter table public.battles
  add column format                text not null default 'solo' check (format in ('solo', 'tag')),
  add column challenger_partner_id uuid references public.profiles (id),
  add column opponent_partner_id   uuid references public.profiles (id),
  add column challenger_team_id    uuid references public.teams (id),
  add column opponent_team_id      uuid references public.teams (id),
  add column tag_accepted          boolean not null default false;   -- the other side said yes; now waiting for open seats (if any)
create index battles_partners_idx on public.battles (challenger_partner_id, opponent_partner_id) where format = 'tag';

-- First layer of a team round (the second layer is recorded over it and submitted as the round).
create table public.tag_parts (
  battle_id     uuid not null references public.battles (id) on delete cascade,
  side_captain  uuid not null references public.profiles (id),
  round_number  int  not null,
  profile_id    uuid not null references public.profiles (id),
  audio_path    text not null,
  duration_ms   int  not null,
  waveform_data jsonb,
  created_at    timestamptz not null default now(),
  primary key (battle_id, side_captain, round_number)
);
alter table public.tag_parts enable row level security;
create policy "Tag parts are public" on public.tag_parts for select using (true);

create table public.team_point_events (
  team_id    uuid not null references public.teams (id) on delete cascade,
  battle_id  uuid not null references public.battles (id) on delete cascade,
  points     int  not null,
  created_at timestamptz not null default now(),
  primary key (team_id, battle_id)
);
alter table public.team_point_events enable row level security;
create policy "Team points are public" on public.team_point_events for select using (true);

/** Active members of an active fixed team, captain (first to join) first. */
create or replace function public.team_pair(p_team uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select array_agg(m.profile_id order by m.joined_at, m.profile_id)
    from team_members m join teams t on t.id = m.team_id
   where m.team_id = p_team and m.status = 'active' and t.status = 'active';
$$;

/** Everyone already seated in a battle. */
create or replace function public.tag_seated(b public.battles) returns uuid[]
language sql immutable as $$
  select array_remove(array[b.challenger_id, b.challenger_partner_id, b.opponent_id, b.opponent_partner_id], null);
$$;

/** Start the battle once all four seats are taken: the challenging side records first. */
create or replace function public.tag_try_start(p_battle uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b battles;
begin
  select * into b from battles where id = p_battle for update;
  if b.tag_accepted and b.challenger_partner_id is not null and b.opponent_id is not null and b.opponent_partner_id is not null
     and b.status = 'pending' then
    update battles set status = 'active', started_at = now(), current_turn_user_id = b.challenger_id,
                       turn_deadline = now() + b.response_window
     where id = b.id;
  end if;
end $$;

create or replace function public.create_tag_battle(
  p_team            uuid    default null,   -- my fixed Tag Team, or null for a casual duo
  p_partner         text    default null,   -- casual duo: my partner's @handle, or null to leave the seat open
  p_opponent_team   uuid    default null,   -- challenge this fixed Tag Team, or null for an open challenge
  p_round_duration  int     default 60,
  p_rounds          int     default 1,
  p_voting_hours    int     default 24,
  p_ranked          boolean default true,
  p_is_listed       boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_partner uuid;
  v_pair    uuid[];
  v_opp     uuid[];
  v_id      uuid;
begin
  if v_uid is null then raise exception 'Log in first.' using errcode = '28000'; end if;
  if exists (select 1 from profiles where id = v_uid and (suspended_at is not null or deleted_at is not null)) then
    raise exception 'This account is suspended.' using errcode = '42501';
  end if;
  if p_round_duration not between 30 and 90 then raise exception 'Rounds are 30 to 90 seconds.' using errcode = '22023'; end if;
  if p_rounds not in (1, 2) then raise exception 'One or two rounds per team.' using errcode = '22023'; end if;
  if p_voting_hours not in (1, 12, 24) then raise exception 'Voting stays open 1, 12 or 24 hours.' using errcode = '22023'; end if;

  if p_team is not null then
    v_pair := team_pair(p_team);
    if v_pair is null or cardinality(v_pair) <> 2 or not (v_uid = any (v_pair)) then
      raise exception 'That isn''t one of your active Tag Teams.' using errcode = '42501';
    end if;
    v_partner := case when v_pair[1] = v_uid then v_pair[2] else v_pair[1] end;
  elsif p_partner is not null and btrim(p_partner, ' @') <> '' then
    select id into v_partner from profiles where lower(username) = lower(btrim(p_partner, ' @')) and deleted_at is null;
    if v_partner is null then raise exception 'No beatboxer is called @%.', btrim(p_partner, ' @') using errcode = 'P0002'; end if;
    if v_partner = v_uid then raise exception 'Pick someone else as your partner.' using errcode = '22023'; end if;
  end if;

  if p_opponent_team is not null then
    v_opp := team_pair(p_opponent_team);
    if v_opp is null or cardinality(v_opp) <> 2 then raise exception 'That Tag Team can''t battle right now.' using errcode = '22023'; end if;
    if v_uid = any (v_opp) or v_partner = any (v_opp) then raise exception 'You can''t battle your own Tag Team.' using errcode = '22023'; end if;
  end if;

  if (select count(*) from battles where challenger_id = v_uid and status in ('open', 'pending')) >= 10 then
    raise exception 'You have 10 challenges waiting. Cancel one or wait for replies.' using errcode = '54000';
  end if;

  insert into battles (challenger_id, opponent_id, status, mode, is_listed, round_duration_seconds, rounds_per_player,
                       response_window, voting_window, turn_deadline, ranked,
                       format, challenger_partner_id, opponent_partner_id, challenger_team_id, opponent_team_id)
  values (v_uid, v_opp[1],
          case when v_opp is null then 'open' else 'pending' end::battle_status,
          'async', coalesce(p_is_listed, true), p_round_duration, p_rounds,
          interval '24 hours', make_interval(hours => p_voting_hours),
          now() + case when v_opp is null then interval '7 days' else interval '24 hours' end,
          p_ranked, 'tag', v_partner, v_opp[2], p_team, p_opponent_team)
  returning id into v_id;

  if v_opp is not null then
    perform notify(v_opp[2], 'challenge_received', v_id, v_uid, jsonb_build_object('mode', 'async', 'tag', true));
  end if;
  if v_partner is not null and p_team is null then
    perform notify(v_partner, 'challenge_received', v_id, v_uid, jsonb_build_object('mode', 'async', 'tag', true, 'as_partner', true));
  end if;
  return v_id;
end $$;

/** Take on a Tag Team battle: with one of my fixed teams, or as a casual duo (my partner seat stays open). */
create or replace function public.accept_tag_battle(p_battle uuid, p_team uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  b      battles;
  v_pair uuid[];
begin
  select * into b from battles where id = p_battle for update;
  if not found or b.format <> 'tag' then raise exception 'This isn''t a Tag Team battle.' using errcode = 'P0002'; end if;
  if exists (select 1 from profiles where id = v_uid and (suspended_at is not null or deleted_at is not null)) then
    raise exception 'This account is suspended.' using errcode = '42501';
  end if;
  if b.status = 'pending' then
    -- a specific Tag Team was challenged: either of its members accepts
    if not (v_uid in (b.opponent_id, b.opponent_partner_id)) then
      raise exception 'This challenge is for another Tag Team.' using errcode = '42501';
    end if;
    if b.tag_accepted then raise exception 'Already accepted.' using errcode = '22023'; end if;
    if now() > b.turn_deadline then raise exception 'This challenge has expired.' using errcode = '22023'; end if;
    -- accepted; if a partner seat is still open, the battle waits up to 7 days for it
    update battles set tag_accepted = true, turn_deadline = now() + interval '7 days' where id = b.id;
  elsif b.status = 'open' and b.opponent_id is null then
    if v_uid = any (tag_seated(b)) then raise exception 'You''re already in this battle.' using errcode = '22023'; end if;
    if p_team is not null then
      v_pair := team_pair(p_team);
      if v_pair is null or cardinality(v_pair) <> 2 or not (v_uid = any (v_pair)) then
        raise exception 'That isn''t one of your active Tag Teams.' using errcode = '42501';
      end if;
      if v_pair && tag_seated(b) then raise exception 'Your partner is already on the other side.' using errcode = '22023'; end if;
      update battles set opponent_id = v_uid,
                         opponent_partner_id = case when v_pair[1] = v_uid then v_pair[2] else v_pair[1] end,
                         opponent_team_id = p_team,
                         status = 'pending', tag_accepted = true, turn_deadline = now() + interval '7 days'
       where id = b.id;
    else
      update battles set opponent_id = v_uid, status = 'pending', tag_accepted = true, turn_deadline = now() + interval '7 days'
       where id = b.id;
    end if;
  else
    raise exception 'This battle can''t be accepted any more.' using errcode = '22023';
  end if;
  perform tag_try_start(b.id);
end $$;

/** Fill an open partner seat of a casual duo. */
create or replace function public.join_tag_seat(p_battle uuid, p_side text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  b     battles;
begin
  if v_uid is null then raise exception 'Log in first.' using errcode = '28000'; end if;
  select * into b from battles where id = p_battle for update;
  if not found or b.format <> 'tag' or b.status not in ('open', 'pending') then
    raise exception 'This seat isn''t open.' using errcode = '22023';
  end if;
  if v_uid = any (tag_seated(b)) then raise exception 'You''re already in this battle.' using errcode = '22023'; end if;
  if p_side = 'challenger' and b.challenger_partner_id is null and b.challenger_team_id is null then
    update battles set challenger_partner_id = v_uid where id = b.id;
    perform notify(b.challenger_id, 'team_update', b.id, v_uid, jsonb_build_object('what', 'joined_seat'));
  elsif p_side = 'opponent' and b.opponent_id is not null and b.opponent_partner_id is null and b.opponent_team_id is null then
    update battles set opponent_partner_id = v_uid where id = b.id;
    perform notify(b.opponent_id, 'team_update', b.id, v_uid, jsonb_build_object('what', 'joined_seat'));
  else
    raise exception 'This seat isn''t open.' using errcode = '22023';
  end if;
  perform tag_try_start(b.id);
end $$;

/** First layer of a team round: by either member of the side on turn, before the other records over it. */
create or replace function public.submit_tag_part(p_battle uuid, p_audio_path text, p_duration_ms int, p_waveform jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  b       battles;
  v_cap   uuid;
  v_round int;
  v_prev  uuid;
begin
  select * into b from battles where id = p_battle for update;
  if not found or b.format <> 'tag' or b.status <> 'active' then
    raise exception 'This battle isn''t taking rounds right now.' using errcode = '22023';
  end if;
  v_cap := case when v_uid in (b.challenger_id, b.challenger_partner_id) then b.challenger_id
                when v_uid in (b.opponent_id, b.opponent_partner_id) then b.opponent_id end;
  if v_cap is null then raise exception 'You''re not in this battle.' using errcode = '42501'; end if;
  if b.current_turn_user_id is distinct from v_cap then raise exception 'It''s not your team''s turn.' using errcode = '42501'; end if;
  if now() > b.turn_deadline then raise exception 'Your response window has closed.' using errcode = '22023'; end if;
  if p_duration_ms < 3000 or p_duration_ms > b.round_duration_seconds * 1000 + 500 then
    raise exception 'Parts are 3 to % seconds.', b.round_duration_seconds using errcode = '22023';
  end if;
  if p_audio_path not like (b.id::text || '/' || v_uid::text || '/%')
     or not exists (select 1 from storage.objects where bucket_id = 'battle-audio' and name = p_audio_path) then
    raise exception 'Upload the audio file before submitting.' using errcode = 'P0002';
  end if;
  v_round := (b.turn_number / 2) + 1;
  select profile_id into v_prev from tag_parts where battle_id = b.id and side_captain = v_cap and round_number = v_round;
  if v_prev is not null and v_prev <> v_uid then
    raise exception 'Your partner already recorded the first part: record over it.' using errcode = '22023';
  end if;
  insert into tag_parts (battle_id, side_captain, round_number, profile_id, audio_path, duration_ms, waveform_data)
  values (b.id, v_cap, v_round, v_uid, p_audio_path, p_duration_ms, p_waveform)
  on conflict (battle_id, side_captain, round_number)
  do update set audio_path = excluded.audio_path, duration_ms = excluded.duration_ms,
                waveform_data = excluded.waveform_data, created_at = now();
  perform notify(case when v_uid = v_cap then (case when v_cap = b.challenger_id then b.challenger_partner_id else b.opponent_partner_id end) else v_cap end,
                 'your_turn', b.id, v_uid, jsonb_build_object('tag_part', true));
end $$;

/** Rating for 2v2: each side's average decides the expectation; all four members (and fixed teams) move. */
create or replace function public.apply_tag_elo(p_battle_id uuid, p_score numeric) returns void
language plpgsql security definer set search_path = public as $$
declare
  b      battles;
  r      record;
  avg_c  numeric;
  avg_o  numeric;
  e_c    numeric;
  t      teams;
  e_t    numeric;
  d      int;
begin
  select * into b from battles where id = p_battle_id;
  perform 1 from profiles where id = any (tag_seated(b)) order by id for update;
  select avg(elo_rating) into avg_c from profiles where id in (b.challenger_id, b.challenger_partner_id);
  select avg(elo_rating) into avg_o from profiles where id in (b.opponent_id, b.opponent_partner_id);
  e_c := 1 / (1 + power(10::numeric, (avg_o - avg_c) / 400.0));

  for r in
    select p.*, (p.id in (b.challenger_id, b.challenger_partner_id)) as on_c
      from profiles p where p.id = any (tag_seated(b))
  loop
    d := round((case when r.battles_count < 20 then 40 else 24 end)
               * (case when r.on_c then p_score - e_c else (1 - p_score) - (1 - e_c) end));
    update profiles set
      elo_rating = greatest(100, elo_rating + d),
      peak_elo   = greatest(peak_elo, elo_rating + d),
      wins   = wins   + ((r.on_c and p_score = 1) or (not r.on_c and p_score = 0))::int,
      losses = losses + ((r.on_c and p_score = 0) or (not r.on_c and p_score = 1))::int,
      draws  = draws  + (p_score = 0.5)::int
    where id = r.id;
    insert into elo_history (profile_id, battle_id, elo_before, elo_after, delta)
    values (r.id, b.id, r.elo_rating, greatest(100, r.elo_rating + d), d);
    if r.id = b.challenger_id then
      update battles set challenger_elo_before = r.elo_rating, challenger_elo_delta = d where id = b.id;
    elsif r.id = b.opponent_id then
      update battles set opponent_elo_before = r.elo_rating, opponent_elo_delta = d where id = b.id;
    end if;
  end loop;

  -- fixed Tag Teams: their own rating against the other side
  for t in select * from teams where id in (b.challenger_team_id, b.opponent_team_id) for update loop
    if t.id = b.challenger_team_id then
      e_t := 1 / (1 + power(10::numeric, (coalesce((select elo_rating from teams where id = b.opponent_team_id), avg_o) - t.elo_rating) / 400.0));
      d := round((case when t.battles_count < 20 then 40 else 24 end) * (p_score - e_t));
    else
      e_t := 1 / (1 + power(10::numeric, (coalesce((select elo_rating from teams where id = b.challenger_team_id), avg_c) - t.elo_rating) / 400.0));
      d := round((case when t.battles_count < 20 then 40 else 24 end) * ((1 - p_score) - e_t));
    end if;
    update teams set
      elo_rating = greatest(100, elo_rating + d),
      peak_elo   = greatest(peak_elo, elo_rating + d),
      wins   = wins   + ((t.id = b.challenger_team_id and p_score = 1) or (t.id = b.opponent_team_id and p_score = 0))::int,
      losses = losses + ((t.id = b.challenger_team_id and p_score = 0) or (t.id = b.opponent_team_id and p_score = 1))::int,
      draws  = draws  + (p_score = 0.5)::int
    where id = t.id;
  end loop;
end $$;

-- Partners can't vote on their own battle.
create or replace function public.tag_vote_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from battles b where b.id = new.battle_id and b.format = 'tag'
               and new.voter_id in (b.challenger_partner_id, b.opponent_partner_id)) then
    raise exception 'You can''t vote on your own battle.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger votes_tag_guard before insert on public.votes for each row execute function public.tag_vote_guard();

-- Partners hear about their battle too: their team's turn, voting, the result.
create or replace function public.tag_partner_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_partner uuid;
begin
  if new.format <> 'tag' then return new; end if;
  if new.status = 'active' and new.current_turn_user_id is distinct from old.current_turn_user_id and new.current_turn_user_id is not null then
    v_partner := case when new.current_turn_user_id = new.challenger_id then new.challenger_partner_id else new.opponent_partner_id end;
    perform notify(v_partner, 'your_turn', new.id, null, jsonb_build_object('tag', true));
  end if;
  if new.status = 'voting' and old.status <> 'voting' then
    perform notify(p, 'voting_open', new.id, null, '{}'::jsonb) from unnest(array[new.challenger_partner_id, new.opponent_partner_id]) p where p is not null;
  end if;
  if new.status = 'finished' and old.status <> 'finished' then
    perform notify(p, 'battle_result', new.id, null,
                   jsonb_build_object('outcome', case when new.result = 'no_contest' then 'N' when new.winner_id is null then 'D'
                                                      when new.winner_id = case when p = new.challenger_partner_id then new.challenger_id else new.opponent_id end then 'W' else 'L' end,
                                      'result', new.result))
      from unnest(array[new.challenger_partner_id, new.opponent_partner_id]) p where p is not null;
  end if;
  return new;
end $$;
create trigger battles_tag_partner_notify after update on public.battles
  for each row when (new.format = 'tag') execute function public.tag_partner_notify();

revoke execute on function public.tag_try_start(uuid) from public, anon, authenticated;
revoke execute on function public.apply_tag_elo(uuid, numeric) from public, anon, authenticated;

create or replace function public.apply_elo(p_battle_id uuid, p_score numeric) returns void
language plpgsql security definer set search_path = public as $$
declare
  b     battles;
  c     profiles;
  o     profiles;
  e_c   numeric;
  k_c   int;
  k_o   int;
  d_c   int;
  d_o   int;
begin
  select * into b from battles where id = p_battle_id;
  if b.format = 'tag' then
    perform apply_tag_elo(p_battle_id, p_score);
    return;
  end if;

  -- lock both rows in a fixed order to avoid deadlocks between concurrent finalizations
  perform 1 from profiles where id in (b.challenger_id, b.opponent_id) order by id for update;
  select * into c from profiles where id = b.challenger_id;
  select * into o from profiles where id = b.opponent_id;

  e_c := 1 / (1 + power(10::numeric, (o.elo_rating - c.elo_rating) / 400.0));
  k_c := case when c.battles_count < 20 then 40 else 24 end;
  k_o := case when o.battles_count < 20 then 40 else 24 end;
  d_c := round(k_c * (p_score - e_c));
  d_o := round(k_o * ((1 - p_score) - (1 - e_c)));

  update profiles set
    elo_rating = greatest(100, elo_rating + d_c),
    peak_elo   = greatest(peak_elo, elo_rating + d_c),
    wins   = wins   + (p_score = 1)::int,
    losses = losses + (p_score = 0)::int,
    draws  = draws  + (p_score = 0.5)::int
  where id = c.id;

  update profiles set
    elo_rating = greatest(100, elo_rating + d_o),
    peak_elo   = greatest(peak_elo, elo_rating + d_o),
    wins   = wins   + (p_score = 0)::int,
    losses = losses + (p_score = 1)::int,
    draws  = draws  + (p_score = 0.5)::int
  where id = o.id;

  insert into elo_history (profile_id, battle_id, elo_before, elo_after, delta) values
    (c.id, b.id, c.elo_rating, greatest(100, c.elo_rating + d_c), d_c),
    (o.id, b.id, o.elo_rating, greatest(100, o.elo_rating + d_o), d_o);

  update battles set
    challenger_elo_before = c.elo_rating,
    opponent_elo_before   = o.elo_rating,
    challenger_elo_delta  = d_c,
    opponent_elo_delta    = d_o
  where id = b.id;
end $$;

create or replace function public.submit_round(
  p_battle_id     uuid,
  p_audio_path    text,
  p_source_codec  text,
  p_is_lossless   boolean,
  p_duration_ms   int,
  p_waveform      jsonb,
  p_channels      int  default 1,
  p_sample_rate   int  default null,
  p_bit_depth     int  default null,
  p_lufs          real default null,
  p_peak_dbfs     real default null,
  p_sub_ratio     real default null
) returns public.submissions
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  b        battles;
  v_sub    submissions;
  v_round  int;
  v_next   uuid;
  v_caller uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in to submit a round.' using errcode = '28000';
  end if;

  select * into b from battles where id = p_battle_id for update;
  if not found then
    raise exception 'This battle doesn''t exist.' using errcode = 'P0002';
  end if;
  if b.format = 'tag' then
    -- Tag Team (take turns): either member of the side on turn submits the mixed round,
    -- recorded over the first part of the OTHER member. The round belongs to the side (its captain).
    if b.mode <> 'async' then
      raise exception 'Tag Team battles are take-turns for now.' using errcode = '22023';
    end if;
    if b.status <> 'active' then
      raise exception 'This battle isn''t taking rounds right now.' using errcode = '22023';
    end if;
    v_uid := case when v_caller in (b.challenger_id, b.challenger_partner_id) then b.challenger_id
                  when v_caller in (b.opponent_id, b.opponent_partner_id) then b.opponent_id end;
    if v_uid is null then
      raise exception 'You''re not in this battle.' using errcode = '42501';
    end if;
    if b.current_turn_user_id is distinct from v_uid then
      raise exception 'It''s not your team''s turn.' using errcode = '42501';
    end if;
    if now() > b.turn_deadline then
      raise exception 'Your response window has closed.' using errcode = '22023';
    end if;
    v_round := (b.turn_number / 2) + 1;
    if not exists (select 1 from tag_parts where battle_id = b.id and side_captain = v_uid
                     and round_number = v_round and profile_id <> v_caller) then
      raise exception 'Your partner records the first part; you record over it.' using errcode = '22023';
    end if;
  elsif b.mode::text = 'stage' then
    -- stage: each battler's browser uploads the lossless take of the round
    -- they just performed live; allowed until voting closes
    if v_uid not in (b.challenger_id, b.opponent_id) then
      raise exception 'Only the two battlers can submit rounds.' using errcode = '42501';
    end if;
    if b.status not in ('live', 'voting', 'finished') or now() < b.starts_at then
      raise exception 'Stage rounds are recorded during the live battle.' using errcode = '22023';
    end if;
    if now() > coalesce(b.voting_ends_at, b.live_ends_at + interval '30 minutes',
                        b.finished_at + interval '30 minutes', 'infinity'::timestamptz) then
      raise exception 'The upload window for this battle has closed.' using errcode = '22023';
    end if;
    -- first round number this battler doesn't have yet (a redone round was deleted by the host)
    select min(r) into v_round from generate_series(1, b.rounds_per_player) r
     where not exists (select 1 from submissions s where s.battle_id = b.id and s.user_id = v_uid and s.round_number = r);
    if v_round is null then
      raise exception 'All your rounds are already in.' using errcode = '22023';
    end if;
  elsif b.mode = 'async' and b.status in ('open', 'pending') then
    -- the challenger may record the opening round before anyone accepts
    if v_uid is distinct from b.challenger_id then
      raise exception 'Only the challenger can record before the battle is accepted.' using errcode = '42501';
    end if;
    if b.turn_number > 0 then
      raise exception 'Your opening round is already in.' using errcode = '22023';
    end if;
    v_round := 1;
  elsif b.status <> 'active' then
    raise exception 'This battle isn''t taking rounds right now.' using errcode = '22023';
  elsif b.mode = 'live' then
    if v_uid not in (b.challenger_id, b.opponent_id) then
      raise exception 'Only the two battlers can submit rounds.' using errcode = '42501';
    end if;
    if now() >= b.starts_at then
      raise exception 'This live battle has already started.' using errcode = '22023';
    end if;
    if exists (select 1 from submissions where battle_id = b.id and user_id = v_uid) then
      raise exception 'Your round is already in.' using errcode = '22023';
    end if;
    v_round := 1;
  else
    if b.current_turn_user_id is distinct from v_uid then
      raise exception 'It''s not your turn.' using errcode = '42501';
    end if;
    if now() > b.turn_deadline then
      raise exception 'Your response window has closed.' using errcode = '22023';
    end if;
    v_round := (b.turn_number / 2) + 1;
  end if;

  if p_duration_ms > b.round_duration_seconds * 1000 + 500 then
    raise exception 'Rounds in this battle are % seconds max.', b.round_duration_seconds using errcode = '22023';
  end if;
  if p_duration_ms < 3000 then
    raise exception 'Rounds must be at least 3 seconds long.' using errcode = '22023';
  end if;
  if p_audio_path not like (b.id::text || '/' || v_caller::text || '/%') then
    raise exception 'The audio file is in the wrong folder.' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects
                 where bucket_id = 'battle-audio' and name = p_audio_path) then
    raise exception 'Upload the audio file before submitting.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_waveform -> 'full') <> 'array'
     or jsonb_typeof(p_waveform -> 'low') <> 'array'
     or jsonb_array_length(p_waveform -> 'full') > 2000 then
    raise exception 'Waveform data is malformed.' using errcode = '22023';
  end if;

  insert into submissions (battle_id, user_id, round_number, audio_path, source_codec, is_lossless,
                           sample_rate, bit_depth, channels, duration_ms, waveform_data,
                           integrated_lufs, peak_dbfs, sub_ratio)
  values (b.id, v_uid, v_round, p_audio_path, p_source_codec, p_is_lossless,
          p_sample_rate, p_bit_depth, p_channels, p_duration_ms, p_waveform,
          p_lufs, p_peak_dbfs, p_sub_ratio)
  returning * into v_sub;

  if b.mode = 'async' and b.status in ('open', 'pending') then
    update battles set turn_number = 1 where id = b.id;                -- opening round in, still waiting for an opponent
  elsif b.mode::text in ('live', 'stage') then
    update battles set turn_number = turn_number + 1 where id = b.id;   -- "rounds in" counter for the lobby
  elsif b.turn_number + 1 >= b.rounds_per_player * 2 then
    update battles
       set turn_number = turn_number + 1,
           status = 'voting',
           current_turn_user_id = null,
           turn_deadline = null,
           voting_ends_at = now() + voting_window
     where id = b.id;
  else
    v_next := case when v_uid = b.challenger_id then b.opponent_id else b.challenger_id end;
    update battles
       set turn_number = turn_number + 1,
           current_turn_user_id = v_next,
           turn_deadline = now() + response_window
     where id = b.id;
  end if;

  return v_sub;
end $$;

create or replace function public.award_battle_points() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_at     timestamptz := coalesce(new.finished_at, now());
  v_season integer := current_season_id(v_at);
begin
  if not new.ranked or new.result is null or new.result = 'no_contest' or new.opponent_id is null then
    return new;
  end if;

  with sides(pid, cap) as (
    select * from (values (new.challenger_id, new.challenger_id), (new.opponent_id, new.opponent_id),
                          (new.challenger_partner_id, new.challenger_id), (new.opponent_partner_id, new.opponent_id)) v(pid, cap)
     where pid is not null),
  ins as (
    insert into point_events (profile_id, battle_id, reason, points, season_id, created_at)
    select pid, new.id, point_reason_for(new, cap), points_for(point_reason_for(new, cap)), v_season, v_at
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

  -- fixed Tag Teams earn the same points as their captain
  if new.format = 'tag' then
    with t(team, cap) as (select * from (values (new.challenger_team_id, new.challenger_id), (new.opponent_team_id, new.opponent_id)) v(team, cap) where team is not null),
    ins as (
      insert into team_point_events (team_id, battle_id, points, created_at)
      select team, new.id, points_for(point_reason_for(new, cap)), v_at from t
      on conflict (team_id, battle_id) do nothing
      returning team_id, points
    )
    update teams set total_points = teams.total_points + ins.points from ins where teams.id = ins.team_id;
  end if;

  return new;
end $$;

alter publication supabase_realtime add table public.tag_parts;
