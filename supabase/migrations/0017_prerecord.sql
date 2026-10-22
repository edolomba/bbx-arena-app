-- =============================================================================
-- Beatbox Arena: record your opening round when you challenge
-- Run ONCE in the Supabase SQL Editor, after 0001 to 0016.
--
-- In take-turns battles the challenger can record round 1 right away, before
-- the opponent accepts. When they accept, the battle starts on their turn: they
-- listen to the opening round and answer (24 h). Recording first stays optional.
-- =============================================================================

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
    -- If the challenger already recorded their opening round, the battle starts on
    -- the accepter's turn: they hear it and answer. Otherwise the challenger opens.
    update battles
       set opponent_id = v_uid, status = 'active', started_at = now(),
           current_turn_user_id = case when b.turn_number >= 1 then v_uid else b.challenger_id end,
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

create or replace function public.battle_notifications() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_info jsonb := jsonb_build_object('mode', new.mode, 'starts_at', new.starts_at);
  v_side record;
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' and new.opponent_id is not null then
      perform notify(new.opponent_id, 'challenge_received', new.id, new.challenger_id, v_info);
    end if;
    return new;
  end if;

  -- accepted (open challenge taken, or direct challenge accepted)
  if old.status in ('open', 'pending') and new.status = 'active' then
    perform notify(new.challenger_id, 'challenge_accepted', new.id, new.opponent_id,
                   v_info || jsonb_build_object('their_turn', new.mode = 'async' and new.current_turn_user_id = new.opponent_id));
  end if;

  -- declined by the opponent (not expiry: expiry runs without a signed-in user)
  if old.status = 'pending' and new.status = 'cancelled' and auth.uid() = new.opponent_id then
    perform notify(new.challenger_id, 'challenge_declined', new.id, new.opponent_id, v_info);
  end if;

  -- take turns: the turn moved to someone
  if new.mode = 'async' and old.status = 'active' and new.status = 'active'
     and new.current_turn_user_id is distinct from old.current_turn_user_id then
    perform notify(new.current_turn_user_id, 'your_turn', new.id,
                   case when new.current_turn_user_id = new.challenger_id then new.opponent_id else new.challenger_id end,
                   jsonb_build_object('deadline', new.turn_deadline));
  end if;

  if new.status = 'voting' and old.status is distinct from 'voting' then
    perform notify(new.challenger_id, 'voting_open', new.id, new.opponent_id, jsonb_build_object('ends_at', new.voting_ends_at));
    perform notify(new.opponent_id,  'voting_open', new.id, new.challenger_id, jsonb_build_object('ends_at', new.voting_ends_at));
  end if;

  if new.status = 'finished' and old.status is distinct from 'finished' and new.opponent_id is not null then
    for v_side in
      select new.challenger_id as me, new.opponent_id as them, new.challenger_elo_delta as delta
      union all
      select new.opponent_id, new.challenger_id, new.opponent_elo_delta
    loop
      perform notify(v_side.me, 'battle_result', new.id, v_side.them, jsonb_build_object(
        'result', new.result,
        'outcome', case when new.result = 'no_contest' then 'N'
                        when new.result = 'draw' then 'D'
                        when new.winner_id = v_side.me then 'W' else 'L' end,
        'forfeited_by_me', new.forfeited_by = v_side.me,
        'elo_delta', v_side.delta));
    end loop;
  end if;

  return new;
end $$;
