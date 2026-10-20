-- =============================================================================
-- BBX Arena: host-run stages with judges, open challenges for every format
-- Run ONCE in the Supabase SQL Editor, after 0001 to 0005.
--
-- Stage battles are now run by a host: Start round A, Start round B, Start
-- voting. 3 or 5 judges (plus an optional reserve) vote within a short window;
-- the majority wins and every judge's vote is shown after the result. If the
-- host is one of the battlers, the battle is Casual: no rating, no points.
-- Any format can also be posted as an open challenge ("random opponent").
-- =============================================================================

alter type public.notification_kind add value if not exists 'judge_invited';
alter type public.notification_kind add value if not exists 'host_invited';

alter table public.battles
  add column host_id            uuid references public.profiles (id),
  add column judge_count        smallint check (judge_count in (0, 3, 5)),
  add column judge_vote_seconds smallint not null default 15 check (judge_vote_seconds in (10, 15, 30)),
  add column ranked             boolean not null default true,
  add column stage_phase        text not null default 'idle'
                                check (stage_phase in ('idle', 'round', 'voting', 'tiebreak', 'result')),
  add column stage_slot         smallint,
  add column stage_started_at   timestamptz,
  add column stage_ends_at      timestamptz,
  add column stage_votes_in     smallint not null default 0;

-- Live and stage battles may now be open challenges (no opponent yet).
alter table public.battles drop constraint battles_live_needs_start;
alter table public.battles add constraint battles_scheduled_needs_start
  check (mode = 'async' or starts_at is not null);

create table public.battle_judges (
  battle_id   uuid not null references public.battles (id) on delete cascade,
  judge_id    uuid not null references public.profiles (id) on delete cascade,
  is_reserve  boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (battle_id, judge_id)
);

create table public.judge_votes (
  battle_id   uuid not null references public.battles (id) on delete cascade,
  judge_id    uuid not null references public.profiles (id) on delete cascade,
  voted_for   uuid not null references public.profiles (id),
  created_at  timestamptz not null default now(),
  primary key (battle_id, judge_id)
);

alter table public.battle_judges enable row level security;
alter table public.judge_votes   enable row level security;
create policy "Judges are public" on public.battle_judges for select using (true);
-- A judge's vote stays private until the result is out, so nobody follows the others.
create policy "Judge votes are public after the result" on public.judge_votes for select
  using (judge_id = auth.uid() or exists (
    select 1 from public.battles b where b.id = battle_id
      and (b.stage_phase in ('tiebreak', 'result') or b.status = 'finished')));

-- -----------------------------------------------------------------------------
-- Create a challenge (replaces the previous version: new host/judge options)
-- -----------------------------------------------------------------------------
drop function if exists public.create_challenge(text, integer, text, integer, integer, integer, integer, boolean);

create or replace function public.create_challenge(
  p_opponent_username   text    default null,
  p_round_duration      int     default 45,
  p_mode                text    default 'async',
  p_voting_hours        int     default 24,
  p_starts_in_minutes   int     default null,
  p_rounds_per_player   int     default 1,
  p_response_hours      int     default 24,
  p_is_listed           boolean default true,
  p_host_username       text    default null,
  p_judges              text[]  default null,
  p_reserve_judge       text    default null,
  p_judge_seconds       int     default 15
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_opp      uuid;
  v_host     uuid;
  v_id       uuid;
  v_live     boolean := p_mode in ('live', 'stage');
  v_stage    boolean := p_mode = 'stage';
  v_window   interval := make_interval(hours => p_response_hours);
  v_start    timestamptz;
  v_judges   uuid[] := '{}';
  v_reserve  uuid;
  v_name     text;
  v_jid      uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to create a challenge.' using errcode = '28000';
  end if;
  if p_mode not in ('async', 'live', 'stage') then
    raise exception 'Unknown battle format.' using errcode = '22023';
  end if;
  if p_voting_hours not in (1, 12, 24) then
    raise exception 'Voting can stay open for 1, 12 or 24 hours.' using errcode = '22023';
  end if;

  if p_opponent_username is not null and btrim(p_opponent_username, ' @') <> '' then
    select id into v_opp from profiles where lower(username) = lower(btrim(p_opponent_username, ' @')) and deleted_at is null;
    if v_opp is null then
      raise exception 'No beatboxer is called @%.', btrim(p_opponent_username, ' @') using errcode = 'P0002';
    end if;
    if v_opp = v_uid then
      raise exception 'You can''t challenge yourself.' using errcode = '22023';
    end if;
  end if;

  if v_live then
    if p_starts_in_minutes is null or p_starts_in_minutes not between 5 and 10080 then
      raise exception 'Live and stage battles start between 5 minutes and 7 days from now.' using errcode = '22023';
    end if;
    v_start := now() + make_interval(mins => p_starts_in_minutes);
  end if;

  -- Stage: host and judges
  if v_stage then
    v_host := v_uid;
    if p_host_username is not null and btrim(p_host_username, ' @') <> '' then
      select id into v_host from profiles where lower(username) = lower(btrim(p_host_username, ' @')) and deleted_at is null;
      if v_host is null then
        raise exception 'No beatboxer is called @% (host).', btrim(p_host_username, ' @') using errcode = 'P0002';
      end if;
      if v_host = v_opp then
        raise exception 'Your opponent can''t also be the host.' using errcode = '22023';
      end if;
    end if;

    foreach v_name in array coalesce(p_judges, '{}') loop
      select id into v_jid from profiles where lower(username) = lower(btrim(v_name, ' @')) and deleted_at is null;
      if v_jid is null then
        raise exception 'No beatboxer is called @% (judge).', btrim(v_name, ' @') using errcode = 'P0002';
      end if;
      if v_jid in (v_uid, v_host) or v_jid = v_opp then
        raise exception '@% can''t judge: battlers and the host can''t be judges.', btrim(v_name, ' @') using errcode = '22023';
      end if;
      if v_jid = any (v_judges) then
        raise exception '@% is in the judges list twice.', btrim(v_name, ' @') using errcode = '22023';
      end if;
      v_judges := v_judges || v_jid;
    end loop;
    if cardinality(v_judges) not in (0, 3, 5) then
      raise exception 'Choose 3 or 5 judges, or none for a public vote.' using errcode = '22023';
    end if;

    if p_reserve_judge is not null and btrim(p_reserve_judge, ' @') <> '' then
      if cardinality(v_judges) = 0 then
        raise exception 'A reserve judge needs a judging panel.' using errcode = '22023';
      end if;
      select id into v_reserve from profiles where lower(username) = lower(btrim(p_reserve_judge, ' @')) and deleted_at is null;
      if v_reserve is null then
        raise exception 'No beatboxer is called @% (reserve judge).', btrim(p_reserve_judge, ' @') using errcode = 'P0002';
      end if;
      if v_reserve in (v_uid, v_host) or v_reserve = v_opp or v_reserve = any (v_judges) then
        raise exception 'The reserve judge must be someone else.' using errcode = '22023';
      end if;
    end if;

    if p_judge_seconds not in (10, 15, 30) then
      raise exception 'Judges get 10, 15 or 30 seconds to vote.' using errcode = '22023';
    end if;
  end if;

  if (select count(*) from battles
      where challenger_id = v_uid and status in ('open', 'pending')) >= 10 then
    raise exception 'You have 10 challenges waiting. Cancel one or wait for replies.' using errcode = '54000';
  end if;

  insert into battles (challenger_id, opponent_id, status, mode, is_listed, round_duration_seconds,
                       rounds_per_player, response_window, voting_window, starts_at, turn_deadline,
                       host_id, judge_count, judge_vote_seconds, ranked)
  values (v_uid, v_opp,
          case when v_opp is null then 'open' else 'pending' end::battle_status,
          p_mode::battle_mode,
          coalesce(p_is_listed, true),
          p_round_duration,
          case when p_mode = 'live' then 1
               when p_mode = 'stage' then least(greatest(p_rounds_per_player, 1), 2)
               else p_rounds_per_player end,
          v_window,
          make_interval(hours => p_voting_hours),
          v_start,
          case when v_live then v_start                       -- accept before the start
               when v_opp is null then now() + interval '7 days'
               else now() + v_window end,
          v_host,
          case when v_stage then cardinality(v_judges) end,
          coalesce(p_judge_seconds, 15),
          not (v_stage and v_host = v_uid))                   -- a battler hosting = Casual
  returning id into v_id;

  insert into battle_invites (battle_id) values (v_id);

  if v_stage then
    insert into battle_judges (battle_id, judge_id) select v_id, unnest(v_judges);
    if v_reserve is not null then
      insert into battle_judges (battle_id, judge_id, is_reserve) values (v_id, v_reserve, true);
    end if;
    for v_jid in select judge_id from battle_judges where battle_id = v_id loop
      perform notify(v_jid, 'judge_invited', v_id, v_uid, jsonb_build_object('starts_at', v_start));
    end loop;
    if v_host <> v_uid then
      perform notify(v_host, 'host_invited', v_id, v_uid, jsonb_build_object('starts_at', v_start));
    end if;
  end if;

  return v_id;
end $$;
create or replace function public.accept_challenge(p_battle_id uuid, p_token text default null)
returns public.battles
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  b     battles;
begin
  if v_uid is null then
    raise exception 'Sign in to accept this challenge.' using errcode = '28000';
  end if;

  select * into b from battles where id = p_battle_id for update;
  if not found then
    raise exception 'This battle doesn''t exist.' using errcode = 'P0002';
  end if;
  if b.challenger_id = v_uid then
    raise exception 'You can''t accept your own challenge.' using errcode = '22023';
  end if;
  if b.host_id = v_uid or exists (select 1 from battle_judges where battle_id = b.id and judge_id = v_uid and active) then
    raise exception 'You''re hosting or judging this battle, so you can''t battle in it.' using errcode = '22023';
  end if;
  if b.turn_deadline is not null and b.turn_deadline < now() then
    raise exception 'This challenge has expired.' using errcode = '22023';
  end if;

  if b.status = 'open' then
    if not b.is_listed and not exists (
      select 1 from battle_invites where battle_id = b.id and token = p_token) then
      raise exception 'This challenge needs its invite link.' using errcode = '42501';
    end if;
  elsif b.status = 'pending' then
    if b.opponent_id <> v_uid then
      raise exception 'This challenge was sent to someone else.' using errcode = '42501';
    end if;
  else
    raise exception 'This challenge can no longer be accepted.' using errcode = '22023';
  end if;

  if b.mode::text in ('live', 'stage') then
    update battles
       set opponent_id = v_uid, status = 'active', started_at = now(),
           current_turn_user_id = null, turn_deadline = null
     where id = b.id
    returning * into b;
  else
    update battles
       set opponent_id = v_uid, status = 'active', started_at = now(),
           current_turn_user_id = b.challenger_id,       -- challenger opens
           turn_deadline = now() + b.response_window
     where id = b.id
    returning * into b;
  end if;

  return b;
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
begin
  if v_uid is null then
    raise exception 'Sign in to submit a round.' using errcode = '28000';
  end if;

  select * into b from battles where id = p_battle_id for update;
  if not found then
    raise exception 'This battle doesn''t exist.' using errcode = 'P0002';
  end if;
  if b.mode::text = 'stage' then
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
  if p_audio_path not like (b.id::text || '/' || v_uid::text || '/%') then
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

  if b.mode::text in ('live', 'stage') then
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

create or replace function public.advance_battle(p_battle_id uuid) returns public.battle_status
language plpgsql security definer set search_path = public as $$
declare
  b          battles;
  v_n        int;
  v_ms       bigint;
  v_missing  uuid;
begin
  select * into b from battles where id = p_battle_id for update;
  if not found then
    return null;
  end if;

  -- invitations nobody accepted in time
  if b.status in ('open', 'pending') and b.turn_deadline < now() then
    update battles set status = 'cancelled', result = 'no_contest', finished_at = now(), turn_deadline = null
     where id = b.id returning * into b;
  end if;

  -- take turns: missed response window
  if b.mode = 'async' and b.status = 'active' and b.turn_deadline < now() then
    perform end_battle(b.id, case when b.current_turn_user_id = b.challenger_id then 0 else 1 end, b.current_turn_user_id);
    select * into b from battles where id = b.id;
  end if;

  -- stage: the real-time battle opens. Its timeline is fixed by the round
  -- length and mirrored by lib/live/stage.ts: 10 s intro, rounds alternate
  -- challenger/opponent with 8 s between them, 3 s tail.
  if b.mode::text = 'stage' and b.status = 'active' and b.starts_at <= now() then
    update battles
       set status = 'live',
           live_ends_at = case when b.host_id is not null then null   -- the host runs the clock
                               else b.starts_at + make_interval(secs => (
                                 10 + 2 * b.rounds_per_player * b.round_duration_seconds
                                 + 8 * (2 * b.rounds_per_player - 1) + 3)::double precision) end
     where id = b.id returning * into b;
  end if;

  -- live: premiere time reached
  if b.mode = 'live' and b.status = 'active' and b.starts_at <= now() then
    select count(*), coalesce(sum(duration_ms), 0) into v_n, v_ms from submissions where battle_id = b.id;
    if v_n = 2 then
      -- timeline shared with the client: 3 s intro, rounds back to back with 4 s gaps, 1.5 s tail
      update battles
         set status = 'live',
             live_ends_at = b.starts_at + make_interval(secs => ((3000 + v_ms + 4000 * (v_n - 1) + 1500) / 1000.0)::double precision)
       where id = b.id returning * into b;
    elsif v_n = 1 then
      v_missing := case when exists (select 1 from submissions where battle_id = b.id and user_id = b.challenger_id)
                        then b.opponent_id else b.challenger_id end;
      perform end_battle(b.id, case when v_missing = b.challenger_id then 0 else 1 end, v_missing);
      select * into b from battles where id = b.id;
    else
      update battles set status = 'cancelled', result = 'no_contest', finished_at = now()
       where id = b.id returning * into b;
    end if;
  end if;

  -- live: last round has played
  if b.status = 'live' and b.live_ends_at <= now() then
    update battles set status = 'voting', voting_ends_at = b.live_ends_at + b.voting_window
     where id = b.id returning * into b;
  end if;

  if b.status = 'voting' and b.voting_ends_at <= now() then
    perform finalize_battle(b.id);
    select * into b from battles where id = b.id;
  end if;

  return b.status;
end $$;

create or replace function public.finalize_battle(p_battle_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  b        battles;
  v_c      int;
  v_o      int;
  v_score  numeric;
begin
  select * into b from battles where id = p_battle_id for update;
  if b.status <> 'voting' then
    return;
  end if;

  select count(*) filter (where voted_for_user_id = b.challenger_id),
         count(*) filter (where voted_for_user_id = b.opponent_id)
    into v_c, v_o
    from votes where battle_id = b.id;

  if v_c + v_o = 0 then
    update battles set status = 'finished', result = 'no_contest', finished_at = now()
     where id = b.id;
    return;
  end if;

  v_score := case when v_c > v_o then 1 when v_c < v_o then 0 else 0.5 end;
  if b.ranked then perform apply_elo(b.id, v_score); end if;

  update battles set
    status      = 'finished',
    result      = case when v_score = 0.5 then 'draw' else 'decision' end::battle_result,
    winner_id   = case when v_score = 1 then b.challenger_id
                       when v_score = 0 then b.opponent_id end,
    finished_at = now()
  where id = b.id;
end $$;

create or replace function public.end_battle(p_battle_id uuid, p_challenger_score numeric, p_forfeited_by uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  b battles;
begin
  select * into b from battles where id = p_battle_id;
  if b.ranked then perform apply_elo(b.id, p_challenger_score); end if;
  update battles set
    status = 'finished',
    result = 'forfeit',
    forfeited_by = p_forfeited_by,
    winner_id = case when p_challenger_score = 1 then b.challenger_id else b.opponent_id end,
    current_turn_user_id = null,
    turn_deadline = null,
    finished_at = now()
  where id = b.id;
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

create or replace function public.cast_vote(p_battle_id uuid, p_voted_for uuid)
returns public.votes
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  b          battles;
  v_created  timestamptz;
  v_vote     votes;
begin
  if v_uid is null then
    raise exception 'Sign in to vote.' using errcode = '28000';
  end if;

  perform advance_battle(p_battle_id);
  select * into b from battles where id = p_battle_id;
  if not found then
    raise exception 'This battle doesn''t exist.' using errcode = 'P0002';
  end if;
  if coalesce(b.judge_count, 0) > 0 then
    -- judged stage battle: the audience vote is the non-binding crowd vote
    if b.stage_phase not in ('voting', 'tiebreak', 'result') then
      raise exception 'The crowd vote opens when the host starts the voting.' using errcode = '22023';
    end if;
    if v_uid = b.host_id or exists (select 1 from battle_judges where battle_id = b.id and judge_id = v_uid and active) then
      raise exception 'Hosts and judges don''t take part in the crowd vote.' using errcode = '42501';
    end if;
  elsif b.status <> 'voting' or now() >= b.voting_ends_at then
    raise exception 'Voting is closed for this battle.' using errcode = '22023';
  end if;
  if v_uid in (b.challenger_id, b.opponent_id) then
    raise exception 'Battlers can''t vote in their own battle.' using errcode = '42501';
  end if;
  if p_voted_for not in (b.challenger_id, b.opponent_id) then
    raise exception 'You can only vote for one of the two battlers.' using errcode = '22023';
  end if;

  select created_at into v_created from profiles where id = v_uid;
  if v_created > now() - interval '24 hours' then
    raise exception 'New accounts can vote 24 hours after signing up.' using errcode = '42501';
  end if;

  begin
    insert into votes (battle_id, voter_id, voted_for_user_id)
    values (b.id, v_uid, p_voted_for)
    returning * into v_vote;
  exception when unique_violation then
    raise exception 'You''ve already voted in this battle.' using errcode = '23505';
  end;

  return v_vote;
end $$;
-- =============================================================================
-- HOST CONTROLS
-- =============================================================================
create or replace function public.stage_host_battle(p_battle uuid) returns public.battles
language plpgsql security definer set search_path = public as $$
declare
  b battles;
begin
  perform advance_battle(p_battle);
  select * into b from battles where id = p_battle for update;
  if not found then
    raise exception 'This battle doesn''t exist.' using errcode = 'P0002';
  end if;
  if b.host_id is distinct from auth.uid() then
    raise exception 'Only the host can do that.' using errcode = '42501';
  end if;
  if b.status <> 'live' then
    raise exception 'The stage isn''t open yet.' using errcode = '22023';
  end if;
  return b;
end $$;

-- Start a round. Without p_slot: the next one in order (A, B, A, B...).
-- With p_slot: redo that round (its earlier recording is discarded).
-- Rounds start 3 seconds after the click, so every screen counts down together.
create or replace function public.stage_start_round(p_battle uuid, p_slot int default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  b       battles := stage_host_battle(p_battle);
  v_slot  int;
  v_user  uuid;
  v_round int;
begin
  if b.stage_phase in ('voting', 'tiebreak', 'result') then
    raise exception 'Voting has started; rounds are over.' using errcode = '22023';
  end if;
  if b.stage_phase = 'round' and now() < b.stage_ends_at then
    raise exception 'A round is still running.' using errcode = '22023';
  end if;
  v_slot := coalesce(p_slot, case when b.stage_slot is null then 0 else b.stage_slot + 1 end);
  if v_slot < 0 or v_slot >= 2 * b.rounds_per_player then
    raise exception 'All rounds have been performed. Start the voting.' using errcode = '22023';
  end if;

  v_user  := case when v_slot % 2 = 0 then b.challenger_id else b.opponent_id end;
  v_round := v_slot / 2 + 1;
  delete from submissions where battle_id = b.id and user_id = v_user and round_number = v_round;

  update battles set stage_phase = 'round', stage_slot = v_slot,
         stage_started_at = now() + interval '3 seconds',
         stage_ends_at = now() + interval '3 seconds' + make_interval(secs => b.round_duration_seconds)
   where id = b.id;
end $$;

-- Cut the current round short.
create or replace function public.stage_stop_round(p_battle uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  b battles := stage_host_battle(p_battle);
begin
  if b.stage_phase = 'round' and now() < b.stage_ends_at then
    update battles set stage_ends_at = now() where id = b.id;
  end if;
end $$;

-- Judges get judge_vote_seconds; with no judges, the battle goes to a public vote.
create or replace function public.stage_start_voting(p_battle uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  b battles := stage_host_battle(p_battle);
begin
  if b.stage_phase = 'round' and now() < b.stage_ends_at then
    raise exception 'Wait for the round to finish.' using errcode = '22023';
  end if;
  if b.stage_phase in ('voting', 'tiebreak', 'result') then
    raise exception 'Voting has already started.' using errcode = '22023';
  end if;
  if b.stage_slot is null then
    raise exception 'No rounds have been performed yet.' using errcode = '22023';
  end if;

  if coalesce(b.judge_count, 0) = 0 then
    update battles set status = 'voting', stage_phase = 'result', live_ends_at = now(),
           voting_ends_at = now() + voting_window
     where id = b.id;
  else
    delete from judge_votes where battle_id = b.id;
    update battles set stage_phase = 'voting', stage_votes_in = 0,
           stage_started_at = now(), stage_ends_at = now() + make_interval(secs => b.judge_vote_seconds)
     where id = b.id;
  end if;
end $$;

create or replace function public.judge_vote(p_battle uuid, p_voted_for uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  b     battles;
begin
  select * into b from battles where id = p_battle for update;
  if not exists (select 1 from battle_judges where battle_id = p_battle and judge_id = v_uid and active) then
    raise exception 'You''re not a judge in this battle.' using errcode = '42501';
  end if;
  if b.stage_phase <> 'voting' or now() > b.stage_ends_at + interval '2 seconds' then
    raise exception 'Judging is closed for this battle.' using errcode = '22023';
  end if;
  if p_voted_for not in (b.challenger_id, b.opponent_id) then
    raise exception 'Vote for one of the two battlers.' using errcode = '22023';
  end if;
  insert into judge_votes (battle_id, judge_id, voted_for) values (p_battle, v_uid, p_voted_for)
  on conflict (battle_id, judge_id) do nothing;
  if found then
    update battles set stage_votes_in = stage_votes_in + 1 where id = p_battle;
  end if;
  perform stage_tally(p_battle);
end $$;

-- Finish a judged battle with a winner.
create or replace function public.finalize_judged(p_battle uuid, p_winner uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  b battles;
begin
  select * into b from battles where id = p_battle for update;
  if b.status = 'finished' then return; end if;
  if b.ranked then
    perform apply_elo(b.id, case when p_winner = b.challenger_id then 1 else 0 end);
  end if;
  update battles set status = 'finished', result = 'decision', winner_id = p_winner,
         stage_phase = 'result', finished_at = now(), live_ends_at = coalesce(live_ends_at, now())
   where id = b.id;
end $$;

-- Count the judges once everyone voted or time ran out. Safe to call from anyone, any time.
-- Main judges count first; a reserve's vote fills in for a main judge who didn't vote.
create or replace function public.stage_tally(p_battle uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  b         battles;
  v_main    int;
  v_missing int;
  v_a       int;
  v_b       int;
begin
  select * into b from battles where id = p_battle for update;
  if not found or b.stage_phase <> 'voting' then
    return coalesce(b.stage_phase, 'none');
  end if;

  select count(*) into v_main
    from judge_votes v join battle_judges j on j.battle_id = v.battle_id and j.judge_id = v.judge_id
   where v.battle_id = b.id and j.active and not j.is_reserve;
  if v_main < b.judge_count and now() < b.stage_ends_at then
    return 'voting';                                   -- still waiting, still time
  end if;
  v_missing := greatest(0, b.judge_count - v_main);

  with counted as (
    select v.voted_for
      from judge_votes v join battle_judges j on j.battle_id = v.battle_id and j.judge_id = v.judge_id
     where v.battle_id = b.id and j.active and not j.is_reserve
    union all
    (select v.voted_for
       from judge_votes v join battle_judges j on j.battle_id = v.battle_id and j.judge_id = v.judge_id
      where v.battle_id = b.id and j.active and j.is_reserve
      order by v.created_at
      limit v_missing)
  )
  select count(*) filter (where voted_for = b.challenger_id),
         count(*) filter (where voted_for = b.opponent_id)
    into v_a, v_b from counted;

  if v_a = v_b then
    update battles set stage_phase = 'tiebreak' where id = b.id;
    return 'tiebreak';
  end if;
  perform finalize_judged(b.id, case when v_a > v_b then b.challenger_id else b.opponent_id end);
  return 'result';
end $$;

create or replace function public.stage_host_decide(p_battle uuid, p_winner uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  b battles := stage_host_battle(p_battle);
begin
  if b.stage_phase <> 'tiebreak' then
    raise exception 'The host only decides a tied vote.' using errcode = '22023';
  end if;
  if p_winner not in (b.challenger_id, b.opponent_id) then
    raise exception 'Choose one of the two battlers.' using errcode = '22023';
  end if;
  perform finalize_judged(b.id, p_winner);
end $$;

-- Swap a judge (before or during the stage, never during a vote).
create or replace function public.stage_replace_judge(p_battle uuid, p_old uuid, p_new_username text) returns void
language plpgsql security definer set search_path = public as $$
declare
  b        battles;
  v_new    uuid;
  v_res    boolean;
begin
  select * into b from battles where id = p_battle for update;
  if b.host_id is distinct from auth.uid() then
    raise exception 'Only the host can change the judges.' using errcode = '42501';
  end if;
  if b.status in ('finished', 'cancelled') or b.stage_phase in ('voting', 'tiebreak', 'result') then
    raise exception 'Judges can''t be changed once voting has started.' using errcode = '22023';
  end if;
  select is_reserve into v_res from battle_judges where battle_id = b.id and judge_id = p_old and active;
  if not found then
    raise exception 'That person isn''t judging this battle.' using errcode = '22023';
  end if;
  select id into v_new from profiles where lower(username) = lower(btrim(p_new_username, ' @')) and deleted_at is null;
  if v_new is null then
    raise exception 'No beatboxer is called @%.', btrim(p_new_username, ' @') using errcode = 'P0002';
  end if;
  if v_new in (b.challenger_id, b.host_id) or v_new = b.opponent_id
     or exists (select 1 from battle_judges where battle_id = b.id and judge_id = v_new and active) then
    raise exception '@% can''t judge this battle.', btrim(p_new_username, ' @') using errcode = '22023';
  end if;

  update battle_judges set active = false where battle_id = b.id and judge_id = p_old;
  insert into battle_judges (battle_id, judge_id, is_reserve) values (b.id, v_new, v_res)
  on conflict (battle_id, judge_id) do update set active = true, is_reserve = excluded.is_reserve;
  perform notify(v_new, 'judge_invited', b.id, b.host_id, jsonb_build_object('starts_at', b.starts_at));
end $$;

-- A judge or host can step down before voting starts.
create or replace function public.stage_decline_judge(p_battle uuid) returns void
language sql security definer set search_path = public as $$
  update battle_judges set active = false
   where battle_id = p_battle and judge_id = auth.uid()
     and exists (select 1 from battles b where b.id = p_battle and b.stage_phase not in ('voting', 'tiebreak', 'result'));
$$;

-- Battles waiting to start: catch the voting window of judged stages too.
create or replace function public.process_stage_votes() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from battles where stage_phase = 'voting' and stage_ends_at < now() - interval '3 seconds'
  loop
    perform stage_tally(r.id);
  end loop;
end $$;
select cron.schedule('bbx-stage-votes', '* * * * *', $$select public.process_stage_votes()$$);

revoke execute on function public.finalize_judged(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.process_stage_votes()        from public, anon, authenticated;
revoke execute on function public.stage_host_battle(uuid)      from public, anon, authenticated;

alter publication supabase_realtime add table public.battle_judges;
