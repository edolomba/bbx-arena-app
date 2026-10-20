-- =============================================================================
-- BBX Arena: events (GBB-style tournaments), part A: registration, live
-- eliminations, judges' rankings and the official classification.
-- Run ONCE in the Supabase SQL Editor, after 0001 to 0006.
--
-- Official classification ("trimmed Borda count"): each judge orders every
-- participant (1 = best). For each participant the best and the worst position
-- are dropped and the rest are added up; lowest total ranks first.
-- Ties: (1) head-to-head inside the tied group, (2) total of all positions,
-- (3) most first places, (4) the host decides.
-- =============================================================================

create type public.event_status as enum ('registration', 'eliminations', 'judging', 'main', 'finished', 'cancelled');

create table public.events (
  id                    uuid primary key default gen_random_uuid(),
  host_id               uuid not null references public.profiles (id),
  title                 text not null check (char_length(title) between 3 and 80),
  description           text check (char_length(description) <= 2000),
  format                text not null default 'gbb' check (format in ('gbb', 'seven_to_smoke')),
  status                public.event_status not null default 'registration',
  ranked                boolean not null default false,       -- points need approval by a moderator
  approved_at           timestamptz,
  max_participants      smallint not null check (max_participants between 4 and 128),
  advance_count         smallint not null check (advance_count in (4, 8, 16, 32)),
  main_format           text not null default 'knockout' check (main_format in ('knockout', 'swiss')),
  judge_count           smallint not null check (judge_count in (3, 5)),
  showcase_seconds      smallint not null default 60 check (showcase_seconds in (30, 45, 60, 90, 120)),
  battle_round_seconds  smallint not null default 45 check (battle_round_seconds in (30, 45, 60, 90)),
  battle_rounds         smallint not null default 1 check (battle_rounds in (1, 2)),
  judge_vote_seconds    smallint not null default 15 check (judge_vote_seconds in (10, 15, 30)),
  registration_closes_at timestamptz not null,
  next_session_at       timestamptz,                          -- shown to everyone; set when pausing
  live                  boolean not null default false,       -- a session is running right now
  -- live showcase state (eliminations)
  stage_profile         uuid references public.profiles (id),
  stage_started_at      timestamptz,
  stage_ends_at         timestamptz,
  published_at          timestamptz,                          -- official classification published
  champion_id           uuid references public.profiles (id),
  created_at            timestamptz not null default now(),
  finished_at           timestamptz,
  check (advance_count < max_participants)
);
create index events_status_idx on public.events (status, created_at desc);

create table public.event_judges (
  event_id    uuid not null references public.events (id) on delete cascade,
  judge_id    uuid not null references public.profiles (id) on delete cascade,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (event_id, judge_id)
);

create table public.event_entries (
  event_id       uuid not null references public.events (id) on delete cascade,
  profile_id     uuid not null references public.profiles (id) on delete cascade,
  status         text not null default 'registered' check (status in ('registered', 'withdrawn', 'removed', 'qualified', 'eliminated')),
  stage_order    smallint,                                   -- running order of the eliminations
  elim_place     smallint,
  elim_score     smallint,
  final_place    smallint,
  created_at     timestamptz not null default now(),
  primary key (event_id, profile_id)
);

-- One lossless showcase per participant (redo replaces it).
create table public.event_showcases (
  event_id         uuid not null references public.events (id) on delete cascade,
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  audio_path       text not null,
  duration_ms      integer not null,
  waveform_data    jsonb not null,
  integrated_lufs  real,
  peak_dbfs        real,
  sub_ratio        real,
  submitted_at     timestamptz not null default now(),
  primary key (event_id, profile_id)
);

-- Each judge's full order. Editable until the host publishes.
create table public.elimination_rankings (
  event_id    uuid not null references public.events (id) on delete cascade,
  judge_id    uuid not null references public.profiles (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  position    smallint not null check (position >= 1),
  primary key (event_id, judge_id, profile_id),
  unique (event_id, judge_id, position)
);
create table public.elimination_submissions (
  event_id      uuid not null references public.events (id) on delete cascade,
  judge_id      uuid not null references public.profiles (id) on delete cascade,
  submitted_at  timestamptz not null default now(),
  primary key (event_id, judge_id)
);
-- The host's order for ties nothing else can break (step 4).
create table public.elimination_manual (
  event_id    uuid not null references public.events (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  manual      smallint not null,
  primary key (event_id, profile_id)
);

-- -----------------------------------------------------------------------------
-- Official classification
-- -----------------------------------------------------------------------------
create or replace function public.elimination_standings(p_event uuid)
returns table (
  profile_id  uuid,
  positions   smallint[],          -- every judge's position, sorted (best first)
  trimmed     integer,             -- the official score
  h2h         integer,             -- head-to-head wins inside the tied group
  full_sum    integer,
  firsts      integer,
  place       integer,
  tied        boolean              -- still tied after every rule: the host decides
)
language sql stable security definer set search_path = public as $$
  with judges as (
    select judge_id from event_judges where event_id = p_event and active
  ),
  r as (
    select er.judge_id, er.profile_id, er.position
      from elimination_rankings er join judges using (judge_id)
     where er.event_id = p_event
  ),
  agg as (
    select r.profile_id,
           array_agg(r.position order by r.position)::smallint[] as positions,
           (sum(r.position) - min(r.position) - max(r.position))::int as trimmed,
           sum(r.position)::int as full_sum,
           (count(*) filter (where r.position = 1))::int as firsts
      from r group by r.profile_id
  ),
  -- head-to-head counted only against the others in the same tied group
  h as (
    select a.profile_id, count(*)::int as h2h
      from agg a
      join agg b on b.trimmed = a.trimmed and b.profile_id <> a.profile_id
      join r ra on ra.profile_id = a.profile_id
      join r rb on rb.profile_id = b.profile_id and rb.judge_id = ra.judge_id
     where ra.position < rb.position
     group by a.profile_id
  ),
  o as (
    select agg.*, coalesce(h.h2h, 0) as h2h, m.manual
      from agg
      left join h on h.profile_id = agg.profile_id
      left join elimination_manual m on m.event_id = p_event and m.profile_id = agg.profile_id
  )
  select o.profile_id, o.positions, o.trimmed, o.h2h, o.full_sum, o.firsts,
         (rank() over (order by o.trimmed, o.h2h desc, o.full_sum, o.firsts desc, o.manual nulls last))::int,
         (count(*) over (partition by o.trimmed, o.h2h, o.full_sum, o.firsts, o.manual)) > 1
    from o
   order by 7, o.profile_id;
$$;

-- =============================================================================
-- Notifications for events
-- =============================================================================
alter type public.notification_kind add value if not exists 'event_judge_invited';
alter type public.notification_kind add value if not exists 'event_update';
alter table public.notifications add column event_id uuid references public.events (id) on delete cascade;

create or replace function public.notify_event(p_user uuid, p_kind public.notification_kind, p_event uuid,
                                               p_actor uuid, p_data jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, event_id, actor_id, data)
  select p_user, p_kind, p_event, p_actor, coalesce(p_data, '{}'::jsonb)
   where p_user is not null and exists (select 1 from profiles where id = p_user and deleted_at is null);
$$;

-- Everyone involved: host, active judges, registered participants.
create or replace function public.notify_event_all(p_event uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  e events;
  u uuid;
begin
  select * into e from events where id = p_event;
  for u in
    select judge_id from event_judges where event_id = p_event and active
    union select profile_id from event_entries where event_id = p_event and status in ('registered', 'qualified')
  loop
    perform notify_event(u, 'event_update', p_event, e.host_id, p_data || jsonb_build_object('title', e.title));
  end loop;
end $$;

-- =============================================================================
-- Helpers
-- =============================================================================
create or replace function public.event_for_host(p_event uuid) returns public.events
language plpgsql security definer set search_path = public as $$
declare e events;
begin
  select * into e from events where id = p_event for update;
  if not found then raise exception 'This event doesn''t exist.' using errcode = 'P0002'; end if;
  if e.host_id is distinct from auth.uid() then raise exception 'Only the host can do that.' using errcode = '42501'; end if;
  return e;
end $$;

create or replace function public.profile_by_handle(p_handle text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where lower(username) = lower(btrim(p_handle, ' @')) and deleted_at is null;
$$;

-- =============================================================================
-- Create an event
-- =============================================================================
create or replace function public.create_event(
  p_title                  text,
  p_max_participants       int,
  p_advance_count          int,
  p_judges                 text[],
  p_registration_hours     int     default 72,
  p_description            text    default null,
  p_main_format            text    default 'knockout',
  p_showcase_seconds       int     default 60,
  p_battle_round_seconds   int     default 45,
  p_battle_rounds          int     default 1,
  p_judge_vote_seconds     int     default 15,
  p_ranked                 boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_id     uuid;
  v_name   text;
  v_jid    uuid;
  v_judges uuid[] := '{}';
begin
  if v_uid is null then raise exception 'Sign in to create an event.' using errcode = '28000'; end if;
  if exists (select 1 from profiles where id = v_uid and (suspended_at is not null or deleted_at is not null)) then
    raise exception 'This account is suspended.' using errcode = '42501';
  end if;
  if p_registration_hours not between 1 and 720 then
    raise exception 'Registration can stay open between 1 hour and 30 days.' using errcode = '22023';
  end if;
  foreach v_name in array coalesce(p_judges, '{}') loop
    v_jid := profile_by_handle(v_name);
    if v_jid is null then raise exception 'No beatboxer is called @% (judge).', btrim(v_name, ' @') using errcode = 'P0002'; end if;
    if v_jid = v_uid then raise exception 'The host can''t also judge.' using errcode = '22023'; end if;
    if v_jid = any (v_judges) then raise exception '@% is in the judges list twice.', btrim(v_name, ' @') using errcode = '22023'; end if;
    v_judges := v_judges || v_jid;
  end loop;
  if cardinality(v_judges) not in (3, 5) then
    raise exception 'Choose 3 or 5 judges.' using errcode = '22023';
  end if;

  insert into events (host_id, title, description, max_participants, advance_count, main_format, judge_count,
                      showcase_seconds, battle_round_seconds, battle_rounds, judge_vote_seconds,
                      registration_closes_at, ranked)
  values (v_uid, btrim(p_title), nullif(btrim(p_description), ''), p_max_participants, p_advance_count, p_main_format,
          cardinality(v_judges), p_showcase_seconds, p_battle_round_seconds, p_battle_rounds, p_judge_vote_seconds,
          now() + make_interval(hours => p_registration_hours), coalesce(p_ranked, false))
  returning id into v_id;

  insert into event_judges (event_id, judge_id) select v_id, unnest(v_judges);
  foreach v_jid in array v_judges loop
    perform notify_event(v_jid, 'event_judge_invited', v_id, v_uid, jsonb_build_object('title', btrim(p_title)));
  end loop;
  return v_id;
end $$;

-- Ranked events only award points once a moderator approves them.
create or replace function public.admin_approve_event(p_event uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Moderators only.' using errcode = '42501'; end if;
  update events set approved_at = case when p_approve then now() end,
                    ranked = case when p_approve then true else false end
   where id = p_event;
end $$;

-- =============================================================================
-- Registration
-- =============================================================================
create or replace function public.register_event(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  e     events;
begin
  if v_uid is null then raise exception 'Sign in to register.' using errcode = '28000'; end if;
  select * into e from events where id = p_event for update;
  if not found then raise exception 'This event doesn''t exist.' using errcode = 'P0002'; end if;
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

create or replace function public.withdraw_event(p_event uuid) returns void
language sql security definer set search_path = public as $$
  update event_entries set status = 'withdrawn'
   where event_id = p_event and profile_id = auth.uid() and status = 'registered'
     and exists (select 1 from events e where e.id = p_event and e.status = 'registration');
$$;

create or replace function public.host_remove_entry(p_event uuid, p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e events := event_for_host(p_event);
begin
  if e.status not in ('registration', 'eliminations') then
    raise exception 'Participants can only be removed before the judging.' using errcode = '22023';
  end if;
  update event_entries set status = 'removed' where event_id = e.id and profile_id = p_profile;
  delete from event_showcases where event_id = e.id and profile_id = p_profile;
end $$;

-- =============================================================================
-- Live eliminations
-- =============================================================================
create or replace function public.host_start_eliminations(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  e   events := event_for_host(p_event);
  n   int;
begin
  if e.status <> 'registration' then raise exception 'The eliminations have already started.' using errcode = '22023'; end if;
  select count(*) into n from event_entries where event_id = e.id and status = 'registered';
  if n <= e.advance_count then
    raise exception 'You need more than % registered beatboxers (now %).', e.advance_count, n using errcode = '22023';
  end if;
  -- random running order
  update event_entries x set stage_order = o.rn
    from (select profile_id, row_number() over (order by random()) as rn
            from event_entries where event_id = e.id and status = 'registered') o
   where x.event_id = e.id and x.profile_id = o.profile_id;
  update events set status = 'eliminations', live = true, next_session_at = null where id = e.id;
  perform notify_event_all(e.id, jsonb_build_object('what', 'eliminations_started'));
end $$;

-- Call a beatboxer to the stage (next in order, or a specific one to redo).
-- The showcase starts 3 seconds after the click so every screen counts down together.
create or replace function public.host_call_showcase(p_event uuid, p_profile uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  e    events := event_for_host(p_event);
  v_p  uuid := p_profile;
begin
  if e.status <> 'eliminations' or not e.live then
    raise exception 'Start or resume the eliminations first.' using errcode = '22023';
  end if;
  if e.stage_ends_at is not null and now() < e.stage_ends_at then
    raise exception 'A showcase is still running.' using errcode = '22023';
  end if;
  if v_p is null then
    select x.profile_id into v_p from event_entries x
     where x.event_id = e.id and x.status = 'registered'
       and not exists (select 1 from event_showcases s where s.event_id = e.id and s.profile_id = x.profile_id)
       and x.profile_id is distinct from e.stage_profile
     order by x.stage_order limit 1;
    if v_p is null then raise exception 'Everyone has performed. Finish the eliminations.' using errcode = '22023'; end if;
  elsif not exists (select 1 from event_entries where event_id = e.id and profile_id = v_p and status = 'registered') then
    raise exception 'That beatboxer isn''t in the eliminations.' using errcode = '22023';
  end if;

  delete from event_showcases where event_id = e.id and profile_id = v_p;   -- redo replaces
  update events set stage_profile = v_p,
         stage_started_at = now() + interval '3 seconds',
         stage_ends_at = now() + interval '3 seconds' + make_interval(secs => e.showcase_seconds)
   where id = e.id;
end $$;

create or replace function public.host_stop_showcase(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e events := event_for_host(p_event);
begin
  if e.stage_ends_at is not null and now() < e.stage_ends_at then
    update events set stage_ends_at = greatest(now(), e.stage_started_at) where id = e.id;
  end if;
end $$;

-- The performer's browser uploads the lossless take right after the showcase.
create or replace function public.submit_showcase(
  p_event uuid, p_audio_path text, p_duration_ms int, p_waveform jsonb,
  p_lufs real default null, p_peak_dbfs real default null, p_sub_ratio real default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  e     events;
begin
  select * into e from events where id = p_event;
  if not found then raise exception 'This event doesn''t exist.' using errcode = 'P0002'; end if;
  if e.stage_profile is distinct from v_uid or now() < e.stage_started_at or now() > e.stage_ends_at + interval '30 minutes' then
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
  values (e.id, v_uid, p_audio_path, p_duration_ms, p_waveform, p_lufs, p_peak_dbfs, p_sub_ratio)
  on conflict (event_id, profile_id) do update set audio_path = excluded.audio_path, duration_ms = excluded.duration_ms,
    waveform_data = excluded.waveform_data, integrated_lufs = excluded.integrated_lufs, peak_dbfs = excluded.peak_dbfs,
    sub_ratio = excluded.sub_ratio, submitted_at = now();
end $$;

-- Pause today's session and announce the next one; resume picks up where it stopped.
create or replace function public.host_pause_event(p_event uuid, p_next_session timestamptz default null) returns void
language plpgsql security definer set search_path = public as $$
declare e events := event_for_host(p_event);
begin
  if e.status in ('finished', 'cancelled') then raise exception 'This event has ended.' using errcode = '22023'; end if;
  if p_next_session is not null and p_next_session < now() then
    raise exception 'The next session must be in the future.' using errcode = '22023';
  end if;
  update events set live = false, next_session_at = p_next_session, stage_ends_at = least(stage_ends_at, now()) where id = e.id;
  perform notify_event_all(e.id, jsonb_build_object('what', 'paused', 'next_session_at', p_next_session));
end $$;

create or replace function public.host_resume_event(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e events := event_for_host(p_event);
begin
  if e.status not in ('eliminations', 'main') then
    raise exception 'There''s no live part to resume right now.' using errcode = '22023';
  end if;
  update events set live = true, next_session_at = null where id = e.id;
  perform notify_event_all(e.id, jsonb_build_object('what', 'resumed'));
end $$;

-- Close the live part. Anyone who never performed drops out; the judges start ranking.
create or replace function public.host_finish_eliminations(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  e  events := event_for_host(p_event);
  n  int;
begin
  if e.status <> 'eliminations' then raise exception 'The eliminations aren''t running.' using errcode = '22023'; end if;
  if e.stage_ends_at is not null and now() < e.stage_ends_at then
    raise exception 'Wait for the showcase to finish.' using errcode = '22023';
  end if;
  select count(*) into n from event_showcases where event_id = e.id;
  if n <= e.advance_count then
    raise exception 'Only % showcases are in; more than % are needed.', n, e.advance_count using errcode = '22023';
  end if;
  update event_entries x set status = 'withdrawn'
   where x.event_id = e.id and x.status = 'registered'
     and not exists (select 1 from event_showcases s where s.event_id = e.id and s.profile_id = x.profile_id);
  update events set status = 'judging', live = false, stage_profile = null where id = e.id;
  perform notify_event_all(e.id, jsonb_build_object('what', 'judging'));
end $$;

-- =============================================================================
-- Judges' rankings (no rush: editable until the host publishes)
-- =============================================================================
create or replace function public.judge_save_ranking(p_event uuid, p_order uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  e      events;
  v_need uuid[];
begin
  select * into e from events where id = p_event for update;
  if not exists (select 1 from event_judges where event_id = p_event and judge_id = v_uid and active) then
    raise exception 'You''re not judging this event.' using errcode = '42501';
  end if;
  if e.status <> 'judging' then raise exception 'The ranking is closed.' using errcode = '22023'; end if;

  select array_agg(s.profile_id order by s.profile_id) into v_need
    from event_showcases s join event_entries x on x.event_id = s.event_id and x.profile_id = s.profile_id
   where s.event_id = e.id and x.status = 'registered';
  if (select array_agg(u order by u) from unnest(p_order) u) is distinct from v_need then
    raise exception 'Rank every beatboxer who performed, each exactly once.' using errcode = '22023';
  end if;

  delete from elimination_rankings where event_id = e.id and judge_id = v_uid;
  insert into elimination_rankings (event_id, judge_id, profile_id, position)
  select e.id, v_uid, u, o::smallint from unnest(p_order) with ordinality as t(u, o);
  insert into elimination_submissions (event_id, judge_id) values (e.id, v_uid)
  on conflict (event_id, judge_id) do update set submitted_at = now();
end $$;

create or replace function public.host_replace_event_judge(p_event uuid, p_old uuid, p_new_handle text) returns void
language plpgsql security definer set search_path = public as $$
declare
  e     events := event_for_host(p_event);
  v_new uuid := profile_by_handle(p_new_handle);
begin
  if e.status in ('main', 'finished', 'cancelled') then
    raise exception 'Judges can''t change after the classification is published.' using errcode = '22023';
  end if;
  if v_new is null then raise exception 'No beatboxer is called @%.', btrim(p_new_handle, ' @') using errcode = 'P0002'; end if;
  if v_new = e.host_id or exists (select 1 from event_entries where event_id = e.id and profile_id = v_new and status in ('registered', 'qualified'))
     or exists (select 1 from event_judges where event_id = e.id and judge_id = v_new and active) then
    raise exception '@% can''t judge this event.', btrim(p_new_handle, ' @') using errcode = '22023';
  end if;
  update event_judges set active = false where event_id = e.id and judge_id = p_old;
  if not found then raise exception 'That person isn''t judging this event.' using errcode = '22023'; end if;
  delete from elimination_submissions where event_id = e.id and judge_id = p_old;
  insert into event_judges (event_id, judge_id) values (e.id, v_new)
  on conflict (event_id, judge_id) do update set active = true;
  perform notify_event(v_new, 'event_judge_invited', e.id, e.host_id, jsonb_build_object('title', e.title));
end $$;

-- Step 4 of the tie rules: the host orders a group nothing else could separate.
create or replace function public.host_break_tie(p_event uuid, p_order uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare e events := event_for_host(p_event);
begin
  if e.status <> 'judging' then raise exception 'Ties are settled before publishing.' using errcode = '22023'; end if;
  delete from elimination_manual where event_id = e.id and profile_id = any (p_order);
  insert into elimination_manual (event_id, profile_id, manual)
  select e.id, u, o::smallint from unnest(p_order) with ordinality as t(u, o);
end $$;

-- Publish: every active judge must have submitted, and no unresolved tie may
-- sit inside the qualifying places (it would decide who goes through or the seeding).
create or replace function public.host_publish_eliminations(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  e       events := event_for_host(p_event);
  v_subs  int;
  r       record;
begin
  if e.status <> 'judging' then raise exception 'There''s no classification to publish.' using errcode = '22023'; end if;
  select count(*) into v_subs from elimination_submissions s
    join event_judges j on j.event_id = s.event_id and j.judge_id = s.judge_id and j.active
   where s.event_id = e.id;
  if v_subs < e.judge_count then
    raise exception 'Waiting for % of % judges.', e.judge_count - v_subs, e.judge_count using errcode = '22023';
  end if;
  if exists (select 1 from elimination_standings(e.id) s where s.tied and s.place <= e.advance_count) then
    raise exception 'There''s a tie inside the qualifying places. Order the tied beatboxers first.' using errcode = '22023';
  end if;

  for r in select * from elimination_standings(e.id) loop
    update event_entries set elim_place = r.place, elim_score = r.trimmed,
           status = case when r.place <= e.advance_count then 'qualified' else 'eliminated' end
     where event_id = e.id and profile_id = r.profile_id;
  end loop;
  update events set status = 'main', published_at = now() where id = e.id;
  perform notify_event_all(e.id, jsonb_build_object('what', 'published'));
end $$;

-- =============================================================================
-- Access: everything is public to read except judges' rankings before publishing
-- =============================================================================
alter table public.events                  enable row level security;
alter table public.event_judges            enable row level security;
alter table public.event_entries           enable row level security;
alter table public.event_showcases         enable row level security;
alter table public.elimination_rankings    enable row level security;
alter table public.elimination_submissions enable row level security;
alter table public.elimination_manual      enable row level security;
create policy "Events are public"            on public.events                  for select using (true);
create policy "Event judges are public"      on public.event_judges            for select using (true);
create policy "Entries are public"           on public.event_entries           for select using (true);
create policy "Showcases are public"         on public.event_showcases         for select using (true);
create policy "Submission status is public"  on public.elimination_submissions for select using (true);
create policy "Tie orders are public"        on public.elimination_manual      for select using (true);
create policy "Rankings are public once published" on public.elimination_rankings for select
  using (judge_id = auth.uid() or exists (select 1 from public.events e where e.id = event_id and e.published_at is not null));

-- The classification itself is only readable once published (or by the host).
create or replace function public.event_standings(p_event uuid)
returns table (profile_id uuid, positions smallint[], trimmed integer, h2h integer, full_sum integer, firsts integer, place integer, tied boolean)
language sql stable security definer set search_path = public as $$
  select s.* from elimination_standings(p_event) s
   where exists (select 1 from events e where e.id = p_event and (e.published_at is not null or e.host_id = auth.uid()));
$$;

revoke execute on function public.elimination_standings(uuid)    from public, anon, authenticated;
revoke execute on function public.notify_event(uuid, public.notification_kind, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.notify_event_all(uuid, jsonb)   from public, anon, authenticated;
revoke execute on function public.event_for_host(uuid)            from public, anon, authenticated;

alter publication supabase_realtime add table public.events, public.event_entries, public.event_showcases, public.elimination_submissions;
