-- =============================================================================
-- BBX Arena: notifications, reports & moderation, account deletion, terms
-- Run ONCE in the Supabase SQL Editor, after 0001 and 0002.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Profiles: admin flag, suspension, terms acceptance, deletion
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column is_admin          boolean not null default false,
  add column suspended_at      timestamptz,
  add column suspension_reason text,
  add column terms_accepted_at timestamptz,
  add column deleted_at        timestamptz;

-- A deleted account's profile row stays (anonymized) so opponents keep their
-- battle history, so it must be able to outlive its auth.users row.
alter table public.profiles drop constraint if exists profiles_id_fkey;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

-- Sign-up stores country and terms acceptance from the form's metadata.
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
  update public.profiles set
    country = case when (new.raw_user_meta_data ->> 'country') ~ '^[A-Z]{2}$'
                   then new.raw_user_meta_data ->> 'country' end,
    terms_accepted_at = case when (new.raw_user_meta_data ->> 'accepted_terms') = 'true' then now() end
  where id = new.id;
  return new;
end $$;

-- Deleted accounts disappear from the directory and the leaderboards.
create or replace view public.directory_entries with (security_invoker = true) as
select
  p.id, p.username, p.full_name, p.avatar_url, p.country, p.bio, p.styles, p.social_links,
  p.signature_audio_path, p.signature_waveform,
  p.elo_rating, p.peak_elo, p.wins, p.losses, p.draws, p.battles_count,
  case when p.battles_count > 0 then round(p.wins::numeric / p.battles_count, 3) end as win_rate,
  rank() over (order by p.elo_rating desc) as global_rank,
  p.created_at
from public.profiles p
where p.deleted_at is null;

create or replace function public.leaderboard_all(p_period text default 'weekly')
returns table (
  rank bigint, profile_id uuid, username text, full_name text, avatar_url text, country text,
  points bigint, battles bigint, wins bigint, elo_rating integer
)
language sql stable security definer set search_path = public as $$
  with per as (
    select e.profile_id as pid, sum(e.points) as pts, count(*) as n,
           count(*) filter (where e.reason in ('win', 'forfeit_win')) as w
      from point_events e
     where case p_period
             when 'weekly' then e.created_at >= date_trunc('week', now())
             when 'season' then e.season_id = current_season_id()
             else true
           end
     group by e.profile_id
  )
  select rank() over (order by per.pts desc),
         p.id, p.username, p.full_name, p.avatar_url, p.country::text,
         per.pts, per.n, per.w, p.elo_rating
    from per
    join profiles p on p.id = per.pid
   where p.deleted_at is null;
$$;

-- -----------------------------------------------------------------------------
-- Suspended or deleted accounts can't create, accept, record or vote.
-- One guard for every write path, so no RPC can be missed.
-- -----------------------------------------------------------------------------
create or replace function public.guard_active_account() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
begin
  if v_actor is not null and exists (
    select 1 from profiles where id = v_actor and (suspended_at is not null or deleted_at is not null)
  ) then
    raise exception 'This account is suspended. Contact the moderators if you think this is a mistake.'
      using errcode = '42501';
  end if;
  return new;
end $$;

create trigger battles_guard_create before insert on public.battles
  for each row execute function public.guard_active_account('challenger_id');
create trigger battles_guard_accept before update on public.battles
  for each row when (new.opponent_id is distinct from old.opponent_id
                     or (old.status in ('open', 'pending') and new.status = 'active'))
  execute function public.guard_active_account('opponent_id');
create trigger submissions_guard before insert on public.submissions
  for each row execute function public.guard_active_account('user_id');
create trigger votes_guard before insert on public.votes
  for each row execute function public.guard_active_account('voter_id');

-- -----------------------------------------------------------------------------
-- Hidden battles (moderation): visible only to their battlers and admins.
-- -----------------------------------------------------------------------------
alter table public.battles
  add column hidden_at          timestamptz,
  add column hidden_reason      text,
  add column live_reminder_sent boolean not null default false;

drop policy "Battles are public" on public.battles;
create policy "Battles are public unless hidden" on public.battles for select
  using (hidden_at is null or auth.uid() in (challenger_id, opponent_id) or public.is_admin());

-- -----------------------------------------------------------------------------
-- NOTIFICATIONS (in-app; push delivery comes in the next stage)
-- -----------------------------------------------------------------------------
create type public.notification_kind as enum (
  'challenge_received', 'challenge_accepted', 'challenge_declined',
  'your_turn', 'live_soon', 'voting_open', 'battle_result'
);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        public.notification_kind not null,
  battle_id   uuid references public.battles (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index notifications_user_idx   on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
create policy "Read own notifications" on public.notifications for select using (user_id = auth.uid());

create or replace function public.mark_notifications_read(p_ids uuid[] default null) returns void
language sql security definer set search_path = public as $$
  update notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
$$;

create or replace function public.notify(p_user uuid, p_kind public.notification_kind, p_battle uuid,
                                         p_actor uuid, p_data jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, battle_id, actor_id, data)
  select p_user, p_kind, p_battle, p_actor, coalesce(p_data, '{}'::jsonb)
   where p_user is not null
     and exists (select 1 from profiles where id = p_user and deleted_at is null);
$$;

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
    perform notify(new.challenger_id, 'challenge_accepted', new.id, new.opponent_id, v_info);
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

create trigger battles_notify after insert or update on public.battles
  for each row execute function public.battle_notifications();

-- Live battles: remind both battlers 15 minutes before the start.
create or replace function public.send_live_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare
  b record;
begin
  for b in
    select * from battles
     where mode = 'live' and status = 'active' and not live_reminder_sent
       and starts_at > now() and starts_at <= now() + interval '15 minutes'
     for update skip locked
  loop
    perform notify(b.challenger_id, 'live_soon', b.id, b.opponent_id, jsonb_build_object('starts_at', b.starts_at));
    perform notify(b.opponent_id,  'live_soon', b.id, b.challenger_id, jsonb_build_object('starts_at', b.starts_at));
    update battles set live_reminder_sent = true where id = b.id;
  end loop;
end $$;

select cron.schedule('bbx-live-reminders', '* * * * *', $$select public.send_live_reminders()$$);

alter publication supabase_realtime add table public.notifications;

-- -----------------------------------------------------------------------------
-- REPORTS & MODERATION
-- -----------------------------------------------------------------------------
create type public.report_reason as enum ('offensive', 'stolen_content', 'fake_account', 'cheating', 'harassment', 'other');
create type public.report_status as enum ('open', 'resolved', 'dismissed');

create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references public.profiles (id) on delete cascade,
  battle_id        uuid references public.battles (id) on delete cascade,
  profile_id       uuid references public.profiles (id) on delete cascade,
  reason           public.report_reason not null,
  details          text check (char_length(details) <= 1000),
  status           public.report_status not null default 'open',
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz,
  resolved_by      uuid references public.profiles (id) on delete set null,
  resolution_note  text check (char_length(resolution_note) <= 1000),
  check (battle_id is not null or profile_id is not null)
);
create index reports_status_idx on public.reports (status, created_at desc);

alter table public.reports enable row level security;
create policy "Reporters and admins read reports" on public.reports for select
  using (reporter_id = auth.uid() or public.is_admin());

create or replace function public.report_content(
  p_reason   text,
  p_battle   uuid default null,
  p_profile  uuid default null,
  p_details  text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'Log in to report something.' using errcode = '28000';
  end if;
  if p_battle is null and p_profile is null then
    raise exception 'Choose what you are reporting.' using errcode = '22023';
  end if;
  if p_profile = v_uid then
    raise exception 'You can''t report yourself.' using errcode = '22023';
  end if;
  if (select count(*) from reports where reporter_id = v_uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'You''ve sent 10 reports today. Try again tomorrow.' using errcode = '54000';
  end if;
  if exists (select 1 from reports where reporter_id = v_uid and status = 'open'
               and battle_id is not distinct from p_battle and profile_id is not distinct from p_profile) then
    raise exception 'You''ve already reported this. A moderator will look at it.' using errcode = '23505';
  end if;

  insert into reports (reporter_id, battle_id, profile_id, reason, details)
  values (v_uid, p_battle, p_profile, p_reason::report_reason, nullif(btrim(p_details), ''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_resolve_report(p_report uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Moderators only.' using errcode = '42501'; end if;
  update reports set status = p_status::report_status, resolved_at = now(), resolved_by = auth.uid(),
                     resolution_note = nullif(btrim(p_note), '')
   where id = p_report;
end $$;

create or replace function public.admin_set_battle_hidden(p_battle uuid, p_hidden boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Moderators only.' using errcode = '42501'; end if;
  update battles set hidden_at = case when p_hidden then now() end,
                     hidden_reason = case when p_hidden then nullif(btrim(p_reason), '') end
   where id = p_battle;
end $$;

create or replace function public.admin_set_suspended(p_profile uuid, p_suspended boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Moderators only.' using errcode = '42501'; end if;
  if p_profile = auth.uid() then raise exception 'You can''t suspend yourself.' using errcode = '22023'; end if;
  update profiles set suspended_at = case when p_suspended then now() end,
                      suspension_reason = case when p_suspended then nullif(btrim(p_reason), '') end
   where id = p_profile;
end $$;

-- -----------------------------------------------------------------------------
-- ACCOUNT DELETION (called by the server with the secret key, never by browsers)
-- Anonymizes the profile, settles open battles, deletes the person's rounds and
-- returns their audio paths so the server can delete the files from storage.
-- -----------------------------------------------------------------------------
create or replace function public.anonymize_profile(p_profile uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_paths text[];
  b record;
begin
  -- battles waiting to start: cancel
  update battles set status = 'cancelled', result = 'no_contest', finished_at = now(), turn_deadline = null
   where status in ('open', 'pending') and p_profile in (challenger_id, opponent_id);

  -- battles in progress: the leaving battler forfeits
  for b in select * from battles where status in ('active', 'live') and p_profile in (challenger_id, opponent_id)
  loop
    if b.opponent_id is null then continue; end if;
    perform end_battle(b.id, case when p_profile = b.challenger_id then 0 else 1 end, p_profile);
  end loop;

  select coalesce(array_agg(audio_path), '{}') into v_paths from submissions where user_id = p_profile;
  delete from submissions where user_id = p_profile;
  delete from notifications where user_id = p_profile;

  update profiles set
    username = 'deleted_' || substr(replace(id::text, '-', ''), 1, 10),
    full_name = null, avatar_url = null, country = null, bio = null, styles = '{}',
    social_links = '{}', signature_audio_path = null, signature_waveform = null,
    is_admin = false, deleted_at = now()
  where id = p_profile;

  return v_paths;
end $$;

-- -----------------------------------------------------------------------------
-- Lock down internal functions
-- -----------------------------------------------------------------------------
revoke execute on function public.notify(uuid, public.notification_kind, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.battle_notifications()  from public, anon, authenticated;
revoke execute on function public.send_live_reminders()   from public, anon, authenticated;
revoke execute on function public.guard_active_account()  from public, anon, authenticated;
revoke execute on function public.anonymize_profile(uuid) from public, anon, authenticated;
grant  execute on function public.anonymize_profile(uuid) to service_role;
