-- =============================================================================
-- BBX Arena: initial schema
-- Profiles (Beatbox World-style identity) + async 1v1 battles (Tactics-style)
--
-- Design rules:
--   * Clients can READ almost everything (transparency), but every WRITE that
--     changes battle state goes through a SECURITY DEFINER function that
--     validates the move. There are no INSERT/UPDATE policies on battles,
--     submissions or votes, so the API cannot bypass the rules.
--   * Audio objects are write-once: no UPDATE/DELETE storage policies, so a
--     round cannot be swapped after the opponent has heard it.
-- =============================================================================

create extension if not exists pg_trgm;
create extension if not exists pg_cron;   -- on Supabase: Database > Extensions > pg_cron

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.battle_status as enum ('open', 'pending', 'active', 'live', 'voting', 'finished', 'cancelled');
create type public.battle_mode as enum ('async', 'live');
create type public.battle_result as enum ('decision', 'forfeit', 'draw', 'no_contest');

-- -----------------------------------------------------------------------------
-- Utility: updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- PROFILES
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  username              text not null check (username ~ '^[A-Za-z0-9_.]{3,24}$'),
  full_name             text check (char_length(full_name) <= 80),
  avatar_url            text,
  country               char(2) check (country ~ '^[A-Z]{2}$'),          -- ISO 3166-1 alpha-2
  bio                   text check (char_length(bio) <= 500),
  styles                text[] not null default '{}'
                        check (cardinality(styles) <= 8)
                        check (styles <@ array[
                          'lip_bass','lip_roll','k_snare','inward_bass','throat_bass','click_roll',
                          'spit_snare','inward_k','vocal_scratch','trumpet','musicality',
                          'technicality','layering','looping','vocals'
                        ]::text[]),
  social_links          jsonb not null default '{}'::jsonb
                        check (jsonb_typeof(social_links) = 'object'),
  -- "Sound Signature": a showcase clip, stored in the same bucket under signatures/{uid}/
  signature_audio_path  text,
  signature_waveform    jsonb,
  elo_rating            integer not null default 1200,
  peak_elo              integer not null default 1200,
  wins                  integer not null default 0,
  losses                integer not null default 0,
  draws                 integer not null default 0,
  battles_count         integer generated always as (wins + losses + draws) stored,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index profiles_username_lower_idx on public.profiles (lower(username));
create index profiles_username_trgm_idx on public.profiles using gin (lower(username) gin_trgm_ops);
create index profiles_country_idx on public.profiles (country);
create index profiles_styles_idx on public.profiles using gin (styles);
create index profiles_elo_idx on public.profiles (elo_rating desc);

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

-- Create a profile automatically when someone signs up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, full_name, avatar_url)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'username', ''),
             'bbx_' || substr(replace(new.id::text, '-', ''), 1, 10)),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  update public.profiles set country = new.raw_user_meta_data ->> 'country'
   where id = new.id and (new.raw_user_meta_data ->> 'country') ~ '^[A-Z]{2}$';
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Lets the sign-up form check a handle before creating the account.
create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_username ~ '^[A-Za-z0-9_.]{3,24}$'
     and not exists (select 1 from profiles where lower(username) = lower(p_username));
$$;

-- -----------------------------------------------------------------------------
-- BATTLES
-- -----------------------------------------------------------------------------
create table public.battles (
  id                      uuid primary key default gen_random_uuid(),
  challenger_id           uuid not null references public.profiles (id),
  opponent_id             uuid references public.profiles (id),           -- null while an open challenge waits
  status                  public.battle_status not null default 'pending',
  mode                    public.battle_mode not null default 'async',
  starts_at               timestamptz,                                    -- live battles: premiere time
  live_ends_at            timestamptz,                                    -- live battles: when the last round finishes playing
  is_listed               boolean not null default true,                  -- open challenges: shown in the queue, or link-only
  round_duration_seconds  smallint not null check (round_duration_seconds in (30, 45, 90)),
  rounds_per_player       smallint not null default 1 check (rounds_per_player between 1 and 3),
  response_window         interval not null default interval '24 hours'
                          check (response_window between interval '1 hour' and interval '72 hours'),
  voting_window           interval not null default interval '24 hours'
                          check (voting_window in (interval '1 hour', interval '12 hours', interval '24 hours')),
  -- turn state (alternating: challenger, opponent, challenger, ...)
  current_turn_user_id    uuid references public.profiles (id),
  turn_number             smallint not null default 0,                    -- submissions made so far
  turn_deadline           timestamptz,                                    -- accept deadline while open/pending, response deadline while active
  voting_ends_at          timestamptz,
  -- outcome
  winner_id               uuid references public.profiles (id),
  result                  public.battle_result,
  forfeited_by            uuid references public.profiles (id),
  challenger_elo_before   integer,
  opponent_elo_before     integer,
  challenger_elo_delta    integer,
  opponent_elo_delta      integer,
  created_at              timestamptz not null default now(),
  started_at              timestamptz,
  finished_at             timestamptz,
  constraint battles_distinct_players check (opponent_id is null or opponent_id <> challenger_id),
  constraint battles_open_has_no_opponent check (status <> 'open' or opponent_id is null),
  constraint battles_live_needs_start check (mode = 'async' or (starts_at is not null and opponent_id is not null))
);

create index battles_status_deadline_idx on public.battles (status, turn_deadline);
create index battles_voting_idx on public.battles (voting_ends_at) where status = 'voting';
create index battles_challenger_idx on public.battles (challenger_id, created_at desc);
create index battles_opponent_idx on public.battles (opponent_id, created_at desc);
create index battles_queue_idx on public.battles (round_duration_seconds, created_at)
  where status = 'open' and is_listed;

-- Invite tokens live apart from battles so they never leak through public reads.
create table public.battle_invites (
  battle_id   uuid primary key references public.battles (id) on delete cascade,
  token       text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- SUBMISSIONS (one per player per round)
-- Spec name audio_file_url -> stored as audio_path (bucket-relative). Paths
-- survive CDN/domain changes; URLs are derived at read time.
-- -----------------------------------------------------------------------------
create table public.submissions (
  id               uuid primary key default gen_random_uuid(),
  battle_id        uuid not null references public.battles (id) on delete cascade,
  user_id          uuid not null references public.profiles (id),
  round_number     smallint not null check (round_number between 1 and 3),
  audio_path       text not null,          -- untouched master as uploaded (WAV/FLAC, or the user's own MP3/M4A)
  stream_path      text,                   -- FLAC derivative written by the transcode worker
  mobile_path      text,                   -- AAC 320k derivative for constrained networks
  source_codec     text not null,          -- pcm_s24le, pcm_s16le, flac, mp3, aac, ...
  is_lossless      boolean not null,
  sample_rate      integer,
  bit_depth        smallint,
  channels         smallint not null default 1 check (channels between 1 and 2),
  duration_ms      integer not null check (duration_ms > 0),
  waveform_data    jsonb not null,         -- {v:1, bins, full:[0..1], low:[0..1]}
  integrated_lufs  real,                   -- BS.1770-style, used only for optional attenuate-only level matching
  peak_dbfs        real,
  sub_ratio        real,                   -- share of energy below ~100 Hz
  verified_at      timestamptz,            -- set by the worker after ffprobe re-measures the file
  submitted_at     timestamptz not null default now(),
  unique (battle_id, user_id, round_number)
);

create index submissions_battle_idx on public.submissions (battle_id, round_number);

-- -----------------------------------------------------------------------------
-- VOTES (public, tied to profiles, one per voter per battle, immutable)
-- -----------------------------------------------------------------------------
create table public.votes (
  id                 uuid primary key default gen_random_uuid(),
  battle_id          uuid not null references public.battles (id) on delete cascade,
  voter_id           uuid not null references public.profiles (id),
  voted_for_user_id  uuid not null references public.profiles (id),
  created_at         timestamptz not null default now(),
  unique (battle_id, voter_id)
);

create index votes_battle_idx on public.votes (battle_id);

-- -----------------------------------------------------------------------------
-- ELO HISTORY (for rating charts on profiles)
-- -----------------------------------------------------------------------------
create table public.elo_history (
  id          bigint generated always as identity primary key,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  battle_id   uuid not null references public.battles (id) on delete cascade,
  elo_before  integer not null,
  elo_after   integer not null,
  delta       integer not null,
  created_at  timestamptz not null default now()
);

create index elo_history_profile_idx on public.elo_history (profile_id, created_at);

-- -----------------------------------------------------------------------------
-- READ MODELS
-- -----------------------------------------------------------------------------
create view public.directory_entries with (security_invoker = true) as
select
  p.id, p.username, p.full_name, p.avatar_url, p.country, p.bio, p.styles, p.social_links,
  p.signature_audio_path, p.signature_waveform,
  p.elo_rating, p.peak_elo, p.wins, p.losses, p.draws, p.battles_count,
  case when p.battles_count > 0 then round(p.wins::numeric / p.battles_count, 3) end as win_rate,
  rank() over (order by p.elo_rating desc) as global_rank,
  p.created_at
from public.profiles p;

-- One row per finished battle per side, newest first (rn = 1 is the latest).
create view public.profile_battles with (security_invoker = true) as
select
  side.profile_id,
  b.id as battle_id,
  side.opponent_id,
  op.username as opponent_username,
  b.mode,
  b.result,
  b.finished_at,
  b.forfeited_by,
  case when b.result = 'draw' then 'D' when b.winner_id = side.profile_id then 'W' else 'L' end as outcome,
  (select count(*) from public.votes v where v.battle_id = b.id and v.voted_for_user_id = side.profile_id)::int as my_votes,
  (select count(*) from public.votes v where v.battle_id = b.id and v.voted_for_user_id = side.opponent_id)::int as their_votes,
  eh.delta,
  eh.elo_after,
  row_number() over (partition by side.profile_id order by b.finished_at desc) as rn
from public.battles b
cross join lateral (values (b.challenger_id, b.opponent_id), (b.opponent_id, b.challenger_id)) as side(profile_id, opponent_id)
join public.profiles op on op.id = side.opponent_id
left join public.elo_history eh on eh.battle_id = b.id and eh.profile_id = side.profile_id
where b.status = 'finished' and b.result in ('decision', 'draw', 'forfeit');

create view public.directory_countries with (security_invoker = true) as
select country, count(*)::int as beatboxers
from public.profiles
where country is not null
group by country;

-- =============================================================================
-- BATTLE STATE MACHINE
--   open/pending --accept--> active --(all rounds in)--> voting --(window ends)--> finished
--   open/pending --deadline--> cancelled
--   active --deadline--> finished (forfeit)
-- =============================================================================

-- Create a challenge.
--   async: p_opponent_username null => open challenge anyone can take.
--   live:  needs a named opponent; both rounds must be in before starts_at.
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
  v_live    boolean := p_mode = 'live';
  v_window  interval := make_interval(hours => p_response_hours);
  v_start   timestamptz;
begin
  if v_uid is null then
    raise exception 'Sign in to create a challenge.' using errcode = '28000';
  end if;
  if p_mode not in ('async', 'live') then
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
      raise exception 'Live battles need a named opponent.' using errcode = '22023';
    end if;
    if p_starts_in_minutes is null or p_starts_in_minutes not between 5 and 10080 then
      raise exception 'Live battles start between 5 minutes and 7 days from now.' using errcode = '22023';
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
          case when v_live then 1 else p_rounds_per_player end,
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

  if b.mode = 'live' then
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

create or replace function public.decline_challenge(p_battle_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update battles
     set status = 'cancelled', result = 'no_contest', finished_at = now(), turn_deadline = null
   where id = p_battle_id
     and status in ('open', 'pending')
     and auth.uid() in (challenger_id, opponent_id);
  if not found then
    raise exception 'Only a pending challenge you''re part of can be declined.' using errcode = '42501';
  end if;
end $$;

-- Quick match (take-turns battles only).
create or replace function public.quick_match(p_round_duration int default 45)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_elo int;
  v_bid uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to find a battle.' using errcode = '28000';
  end if;
  select elo_rating into v_elo from profiles where id = v_uid;

  select b.id into v_bid
    from battles b
    join profiles p on p.id = b.challenger_id
   where b.status = 'open' and b.is_listed and b.mode = 'async'
     and b.challenger_id <> v_uid
     and b.round_duration_seconds = p_round_duration
     and abs(p.elo_rating - v_elo) <= 250
   order by abs(p.elo_rating - v_elo), b.created_at
   limit 1
   for update of b skip locked;

  if v_bid is not null then
    perform accept_challenge(v_bid, null);
    return v_bid;
  end if;

  return create_challenge(p_opponent_username => null, p_round_duration => p_round_duration);
end $$;

-- Submit the caller's round. The file must already be in storage at
-- battle-audio/{battle_id}/{user_id}/...
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
  if b.status <> 'active' then
    raise exception 'This battle isn''t taking rounds right now.' using errcode = '22023';
  end if;

  if b.mode = 'live' then
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

  if b.mode = 'live' then
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

-- -----------------------------------------------------------------------------
-- ELO
--   E_c = 1 / (1 + 10^((R_o - R_c) / 400))
--   delta = K * (S - E),  K = 40 for a player's first 20 battles, then 24
--   p_score is the challenger's score: 1 win, 0.5 draw, 0 loss.
-- -----------------------------------------------------------------------------
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

-- Finish a battle by forfeit: the battler who didn't deliver loses.
create or replace function public.end_battle(p_battle_id uuid, p_challenger_score numeric, p_forfeited_by uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  b battles;
begin
  select * into b from battles where id = p_battle_id;
  perform apply_elo(b.id, p_challenger_score);
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

-- Close voting: majority wins, ties draw, zero votes = no contest (no rating change).
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
  perform apply_elo(b.id, v_score);

  update battles set
    status      = 'finished',
    result      = case when v_score = 0.5 then 'draw' else 'decision' end::battle_result,
    winner_id   = case when v_score = 1 then b.challenger_id
                       when v_score = 0 then b.opponent_id end,
    finished_at = now()
  where id = b.id;
end $$;

-- Move one battle through every deadline that has passed. Idempotent and safe to
-- call from any client: it only acts on deadlines that are already due. Pages call
-- it at the exact moment a countdown ends, so nobody waits for the cron job.
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

-- One vote per signed-in, non-participant account older than 24 hours.
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
  if b.status <> 'voting' or now() >= b.voting_ends_at then
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

-- Every minute: catch up on anything a page didn't already advance.
create or replace function public.process_deadlines() returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    select id from battles
     where (status in ('open', 'pending') and turn_deadline < now())
        or (mode = 'async' and status = 'active' and turn_deadline < now())
        or (mode = 'live' and status = 'active' and starts_at <= now())
        or (status = 'live' and live_ends_at <= now())
        or (status = 'voting' and voting_ends_at <= now())
     for update skip locked
  loop
    perform advance_battle(r.id);
  end loop;
end $$;

select cron.schedule('bbx-process-deadlines', '* * * * *', $$select public.process_deadlines()$$);

-- The server's clock, so every listener in a live room plays the same moment.
create or replace function public.server_now() returns timestamptz
language sql volatile as $$ select clock_timestamp() $$;

-- Internal functions are not callable from the API.
revoke execute on function public.apply_elo(uuid, numeric)  from public, anon, authenticated;
revoke execute on function public.finalize_battle(uuid)      from public, anon, authenticated;
revoke execute on function public.process_deadlines()        from public, anon, authenticated;
revoke execute on function public.end_battle(uuid, numeric, uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user()          from public, anon, authenticated;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.profiles       enable row level security;
alter table public.battles        enable row level security;
alter table public.battle_invites enable row level security;
alter table public.submissions    enable row level security;
alter table public.votes          enable row level security;
alter table public.elo_history    enable row level security;

create policy "Profiles are public"      on public.profiles    for select using (true);
create policy "Battles are public"       on public.battles     for select using (true);
-- Live rounds stay hidden until the premiere, so neither battler can hear the other first.
create policy "Submissions are public once heard" on public.submissions for select
  using (user_id = auth.uid()
         or exists (select 1 from public.battles b
                    where b.id = battle_id and (b.mode = 'async' or b.starts_at <= now())));
create policy "Votes are public"         on public.votes       for select using (true);
create policy "Rating history is public" on public.elo_history for select using (true);

create policy "Challengers read their invite token" on public.battle_invites
  for select to authenticated
  using (exists (select 1 from public.battles b
                 where b.id = battle_id and b.challenger_id = auth.uid()));

-- Owners edit their own identity fields, never ratings or records.
create policy "Edit own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

revoke update on public.profiles from anon, authenticated;
grant update (username, full_name, avatar_url, country, bio, styles, social_links,
              signature_audio_path, signature_waveform)
  on public.profiles to authenticated;

-- =============================================================================
-- STORAGE: write-once audio bucket
--   battle-audio/{battle_id}/{user_id}/{uuid}.wav
--   battle-audio/signatures/{user_id}/{uuid}.wav
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('battle-audio', 'battle-audio', true, 104857600,
        array['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/flac', 'audio/x-flac',
              'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac'])
on conflict (id) do nothing;

create policy "Upload into own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'battle-audio'
              and (storage.foldername(name))[2] = auth.uid()::text);
-- Deliberately no UPDATE or DELETE policies: submitted audio is immutable.

-- =============================================================================
-- REALTIME (live vote counts and turn changes in the battle view)
-- =============================================================================
alter publication supabase_realtime add table public.votes, public.battles, public.submissions;
