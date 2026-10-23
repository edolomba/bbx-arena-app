-- =============================================================================
-- Beatbox Arena: Tag Team battles live (premiere and stage), part 2b
-- Run ONCE in the Supabase SQL Editor, after 0001 to 0021.
--
-- Live premiere: each team records its round in two layers before the start.
-- Stage: both members' mics are open in their team's round; each uploads their
-- own lossless take, and one of them submits the mix as the team's round.
-- Partners join the stage room as battlers, and earn badges like the captains.
-- =============================================================================

-- a stage round has one take per member
alter table public.tag_parts drop constraint tag_parts_pkey;
alter table public.tag_parts add primary key (battle_id, side_captain, round_number, profile_id);

/** Tag Team 2v2 as a live premiere or on stage: same rules as 1v1 (start time, host, judges), four seats. */
create or replace function public.create_tag_battle_live(
  p_mode               text,                 -- 'live' or 'stage'
  p_starts_in_minutes  int,
  p_team               uuid    default null,
  p_partner            text    default null,
  p_opponent_team      uuid    default null,
  p_round_duration     int     default 45,
  p_rounds             int     default 1,
  p_voting_hours       int     default 24,
  p_host_username      text    default null,
  p_judges             text[]  default null,
  p_judge_seconds      int     default 15,
  p_is_listed          boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_partner uuid;
  v_pair    uuid[];
  v_opp     uuid[];
  v_id      uuid;
  b         battles;
begin
  if p_mode not in ('live', 'stage') then raise exception 'Use the take-turns form for that.' using errcode = '22023'; end if;
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

  -- the 1v1 machinery creates the battle (start time, host, judges, invitations)
  v_id := create_challenge(
    p_opponent_username => (select username from profiles where id = v_opp[1]),
    p_round_duration => p_round_duration, p_mode => p_mode, p_voting_hours => p_voting_hours,
    p_starts_in_minutes => p_starts_in_minutes, p_rounds_per_player => p_rounds, p_is_listed => p_is_listed,
    p_host_username => p_host_username, p_judges => p_judges, p_judge_seconds => p_judge_seconds);

  update battles set format = 'tag', challenger_partner_id = v_partner, opponent_partner_id = v_opp[2],
                     challenger_team_id = p_team, opponent_team_id = p_opponent_team
   where id = v_id returning * into b;

  -- nobody can judge or host a battle they're battling in
  if b.host_id = any (tag_seated(b))
     or exists (select 1 from battle_judges j where j.battle_id = b.id and j.judge_id = any (tag_seated(b))) then
    raise exception 'Battlers can''t host or judge their own battle.' using errcode = '22023';
  end if;

  if v_opp is not null then
    perform notify(v_opp[2], 'challenge_received', v_id, v_uid, jsonb_build_object('mode', p_mode, 'tag', true));
  end if;
  if v_partner is not null and p_team is null then
    perform notify(v_partner, 'challenge_received', v_id, v_uid, jsonb_build_object('mode', p_mode, 'tag', true, 'as_partner', true));
  end if;
  return v_id;
end $$;

create or replace function public.tag_try_start(p_battle uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b battles;
begin
  select * into b from battles where id = p_battle for update;
  if b.tag_accepted and b.challenger_partner_id is not null and b.opponent_id is not null and b.opponent_partner_id is not null
     and b.status = 'pending' then
    if b.mode = 'async' then
      update battles set status = 'active', started_at = now(), current_turn_user_id = b.challenger_id,
                         turn_deadline = now() + b.response_window
       where id = b.id;
    elsif now() < b.starts_at then
      -- live premiere and stage: everyone is in; the battle runs at its start time
      update battles set status = 'active', turn_deadline = b.starts_at where id = b.id;
    end if;
  end if;
end $$;

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
    update battles set tag_accepted = true,
                       turn_deadline = case when b.mode = 'async' then now() + interval '7 days' else b.turn_deadline end
     where id = b.id;
  elsif b.status = 'open' and b.opponent_id is null then
    if b.mode <> 'async' and now() >= b.starts_at then raise exception 'This battle has already started.' using errcode = '22023'; end if;
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
                         status = 'pending', tag_accepted = true,
                         turn_deadline = case when b.mode = 'async' then now() + interval '7 days' else b.turn_deadline end
       where id = b.id;
    else
      update battles set opponent_id = v_uid, status = 'pending', tag_accepted = true,
                         turn_deadline = case when b.mode = 'async' then now() + interval '7 days' else b.turn_deadline end
       where id = b.id;
    end if;
  else
    raise exception 'This battle can''t be accepted any more.' using errcode = '22023';
  end if;
  perform tag_try_start(b.id);
end $$;

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
  if not found or b.format <> 'tag' then
    raise exception 'This battle isn''t taking rounds right now.' using errcode = '22023';
  end if;
  v_cap := case when v_uid in (b.challenger_id, b.challenger_partner_id) then b.challenger_id
                when v_uid in (b.opponent_id, b.opponent_partner_id) then b.opponent_id end;
  if v_cap is null then raise exception 'You''re not in this battle.' using errcode = '42501'; end if;
  if b.mode = 'stage' then
    -- each member's own lossless take of the round the team just performed live
    if b.status not in ('live', 'voting') then raise exception 'Stage takes are uploaded during the live battle.' using errcode = '22023'; end if;
    select min(r) into v_round from generate_series(1, b.rounds_per_player) r
     where not exists (select 1 from submissions s where s.battle_id = b.id and s.user_id = v_cap and s.round_number = r)
       and not exists (select 1 from tag_parts p where p.battle_id = b.id and p.side_captain = v_cap and p.round_number = r and p.profile_id = v_uid);
    if v_round is null then raise exception 'Your takes are already in.' using errcode = '22023'; end if;
    if p_audio_path not like (b.id::text || '/' || v_uid::text || '/%')
       or not exists (select 1 from storage.objects where bucket_id = 'battle-audio' and name = p_audio_path) then
      raise exception 'Upload the audio file before submitting.' using errcode = 'P0002';
    end if;
    insert into tag_parts (battle_id, side_captain, round_number, profile_id, audio_path, duration_ms, waveform_data)
    values (b.id, v_cap, v_round, v_uid, p_audio_path, p_duration_ms, p_waveform);
    return;
  end if;
  if b.status <> 'active' then raise exception 'This battle isn''t taking rounds right now.' using errcode = '22023'; end if;
  if b.mode = 'live' then
    if now() >= b.starts_at then raise exception 'This live battle has already started.' using errcode = '22023'; end if;
  else
    if b.current_turn_user_id is distinct from v_cap then raise exception 'It''s not your team''s turn.' using errcode = '42501'; end if;
    if now() > b.turn_deadline then raise exception 'Your response window has closed.' using errcode = '22023'; end if;
  end if;
  if p_duration_ms < 3000 or p_duration_ms > b.round_duration_seconds * 1000 + 500 then
    raise exception 'Parts are 3 to % seconds.', b.round_duration_seconds using errcode = '22023';
  end if;
  if p_audio_path not like (b.id::text || '/' || v_uid::text || '/%')
     or not exists (select 1 from storage.objects where bucket_id = 'battle-audio' and name = p_audio_path) then
    raise exception 'Upload the audio file before submitting.' using errcode = 'P0002';
  end if;
  v_round := case when b.mode = 'live' then 1 else (b.turn_number / 2) + 1 end;
  select profile_id into v_prev from tag_parts where battle_id = b.id and side_captain = v_cap and round_number = v_round;
  if v_prev is not null and v_prev <> v_uid then
    raise exception 'Your partner already recorded the first part: record over it.' using errcode = '22023';
  end if;
  insert into tag_parts (battle_id, side_captain, round_number, profile_id, audio_path, duration_ms, waveform_data)
  values (b.id, v_cap, v_round, v_uid, p_audio_path, p_duration_ms, p_waveform)
  on conflict (battle_id, side_captain, round_number, profile_id)
  do update set audio_path = excluded.audio_path, duration_ms = excluded.duration_ms,
                waveform_data = excluded.waveform_data, created_at = now();
  -- one first layer per team round: replacing it is allowed, a second one by the partner is not
  delete from tag_parts where battle_id = b.id and side_captain = v_cap and round_number = v_round and profile_id <> v_uid;
  perform notify(case when v_uid = v_cap then (case when v_cap = b.challenger_id then b.challenger_partner_id else b.opponent_partner_id end) else v_cap end,
                 'your_turn', b.id, v_uid, jsonb_build_object('tag_part', true));
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
    v_uid := case when v_caller in (b.challenger_id, b.challenger_partner_id) then b.challenger_id
                  when v_caller in (b.opponent_id, b.opponent_partner_id) then b.opponent_id end;
    if v_uid is null then
      raise exception 'You''re not in this battle.' using errcode = '42501';
    end if;
    if b.mode = 'stage' then
      -- the mix of both members' live takes (or one take, if the other never arrived)
      if b.status not in ('live', 'voting', 'finished') then
        raise exception 'Stage rounds are recorded during the live battle.' using errcode = '22023';
      end if;
      select min(r) into v_round from generate_series(1, b.rounds_per_player) r
       where not exists (select 1 from submissions s where s.battle_id = b.id and s.user_id = v_uid and s.round_number = r);
      if v_round is null then raise exception 'All your team''s rounds are already in.' using errcode = '22023'; end if;
    elsif b.status <> 'active' then
      raise exception 'This battle isn''t taking rounds right now.' using errcode = '22023';
    elsif b.mode = 'live' then
      if now() >= b.starts_at then raise exception 'This live battle has already started.' using errcode = '22023'; end if;
      if exists (select 1 from submissions where battle_id = b.id and user_id = v_uid) then
        raise exception 'Your team''s round is already in.' using errcode = '22023';
      end if;
      v_round := 1;
    else
      if b.current_turn_user_id is distinct from v_uid then
        raise exception 'It''s not your team''s turn.' using errcode = '42501';
      end if;
      if now() > b.turn_deadline then
        raise exception 'Your response window has closed.' using errcode = '22023';
      end if;
      v_round := (b.turn_number / 2) + 1;
    end if;
    if b.mode <> 'stage' and not exists (select 1 from tag_parts where battle_id = b.id and side_captain = v_uid
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

  if b.format = 'tag' and b.mode::text in ('live', 'stage') then
    update battles set turn_number = turn_number + 1 where id = b.id;   -- "rounds in" counter
  elsif b.mode = 'async' and b.status in ('open', 'pending') then
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
    if exists (select 1 from event_entries where event_id = p_room and profile_id = v_uid and status in ('registered', 'qualified')) then return 'battler'; end if;
  end if;
  return coalesce(v_role, 'audience');
end $$;

create or replace function public.battle_badges_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.result in ('decision', 'draw', 'forfeit') then
    perform check_battle_badges(new.challenger_id, new.id);
    perform check_battle_badges(new.opponent_id, new.id);
    if new.challenger_partner_id is not null then perform check_battle_badges(new.challenger_partner_id, new.id); end if;
    if new.opponent_partner_id is not null then perform check_battle_badges(new.opponent_partner_id, new.id); end if;
  end if;
  return new;
end $$;
