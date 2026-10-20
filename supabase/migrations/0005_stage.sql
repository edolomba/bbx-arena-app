-- =============================================================================
-- BBX Arena: stage battles (real-time, mic to mic, over LiveKit)
-- Run ONCE in the Supabase SQL Editor, after 0001 to 0004.
--
-- A stage battle happens in real time: at the start time both battlers and the
-- audience join an audio room, and the battlers perform in turns on a fixed
-- timeline. Each battler's browser also records its turn losslessly and
-- uploads it afterwards as the replay.
-- =============================================================================

alter type public.battle_mode add value if not exists 'stage';

create or replace function public.create_challenge(
  p_opponent_username   text    default null,
  p_round_duration      int     default 45,
  p_mode                text    default 'async',
  p_voting_hours        int     default 24,
  p_starts_in_minutes   int     default null,
  p_rounds_per_player   int     default 1,
  p_response_hours      int     default 24,
  p_is_listed           boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_opp     uuid;
  v_id      uuid;
  v_live    boolean := p_mode in ('live', 'stage');
  v_window  interval := make_interval(hours => p_response_hours);
  v_start   timestamptz;
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

  if p_opponent_username is not null and btrim(p_opponent_username) <> '' then
    select id into v_opp from profiles where lower(username) = lower(btrim(p_opponent_username, ' @'));
    if v_opp is null then
      raise exception 'No beatboxer is called @%.', btrim(p_opponent_username, ' @') using errcode = 'P0002';
    end if;
    if v_opp = v_uid then
      raise exception 'You can''t challenge yourself.' using errcode = '22023';
    end if;
  end if;

  if v_live then
    if v_opp is null then
      raise exception 'Live and stage battles need a named opponent.' using errcode = '22023';
    end if;
    if p_starts_in_minutes is null or p_starts_in_minutes not between 5 and 10080 then
      raise exception 'Live and stage battles start between 5 minutes and 7 days from now.' using errcode = '22023';
    end if;
    v_start := now() + make_interval(mins => p_starts_in_minutes);
  end if;

  if (select count(*) from battles
      where challenger_id = v_uid and status in ('open', 'pending')) >= 10 then
    raise exception 'You have 10 challenges waiting. Cancel one or wait for replies.' using errcode = '54000';
  end if;

  insert into battles (challenger_id, opponent_id, status, mode, is_listed, round_duration_seconds,
                       rounds_per_player, response_window, voting_window, starts_at, turn_deadline)
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
          case when v_live then v_start                       -- accept before the premiere
               when v_opp is null then now() + interval '7 days'
               else now() + v_window end)
  returning id into v_id;

  insert into battle_invites (battle_id) values (v_id);
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
    if b.status not in ('live', 'voting') or now() < b.starts_at then
      raise exception 'Stage rounds are recorded during the live battle.' using errcode = '22023';
    end if;
    if now() > coalesce(b.voting_ends_at, b.live_ends_at + interval '30 minutes') then
      raise exception 'The upload window for this battle has closed.' using errcode = '22023';
    end if;
    select count(*) + 1 into v_round from submissions where battle_id = b.id and user_id = v_uid;
    if v_round > b.rounds_per_player then
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
           live_ends_at = b.starts_at + make_interval(secs => (
             10 + 2 * b.rounds_per_player * b.round_duration_seconds
             + 8 * (2 * b.rounds_per_player - 1) + 3)::double precision)
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

create or replace function public.process_deadlines() returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    select id from battles
     where (status in ('open', 'pending') and turn_deadline < now())
        or (mode = 'async' and status = 'active' and turn_deadline < now())
        or (starts_at is not null and status = 'active' and starts_at <= now())
        or (status = 'live' and live_ends_at <= now())
        or (status = 'voting' and voting_ends_at <= now())
     for update skip locked
  loop
    perform advance_battle(r.id);
  end loop;
end $$;

create or replace function public.send_live_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare
  b record;
begin
  for b in
    select * from battles
     where mode::text in ('live', 'stage') and status = 'active' and not live_reminder_sent
       and starts_at > now() and starts_at <= now() + interval '15 minutes'
     for update skip locked
  loop
    perform notify(b.challenger_id, 'live_soon', b.id, b.opponent_id, jsonb_build_object('starts_at', b.starts_at));
    perform notify(b.opponent_id,  'live_soon', b.id, b.challenger_id, jsonb_build_object('starts_at', b.starts_at));
    update battles set live_reminder_sent = true where id = b.id;
  end loop;
end $$;
