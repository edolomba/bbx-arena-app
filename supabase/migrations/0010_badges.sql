-- =============================================================================
-- BBX Arena: badges
-- Run ONCE in the Supabase SQL Editor, after 0001 to 0009.
--
-- Badges are awarded automatically by the database when something happens
-- (a battle or event finishes, a period closes). The rarest badge a beatboxer
-- holds is shown next to their handle. Streak, Underdog and battle-count badges
-- only count Ranked battles, so they can't be farmed in Casual battles.
-- =============================================================================

alter type public.notification_kind add value if not exists 'badge_earned';

create table public.badges (
  code         text primary key,
  name         text not null,
  description  text not null,
  category     text not null check (category in ('battles', 'events', 'ranking', 'community')),
  rarity       smallint not null check (rarity between 1 and 5),   -- 5 = rarest
  sort         smallint not null
);
insert into public.badges (code, name, description, category, rarity, sort) values
  ('first_beat',        'First Beat',        'Finished a first battle.',                                  'battles',   1, 10),
  ('in_the_groove',     'In the Groove',     '5 Ranked wins in a row.',                                   'battles',   2, 20),
  ('encore',            'Encore',            '10 Ranked wins in a row.',                                  'battles',   4, 30),
  ('underdog',          'Underdog',          'Beat someone rated 200 or more above you.',                 'battles',   3, 40),
  ('regular',           'Regular',           '50 Ranked battles.',                                        'battles',   2, 50),
  ('hall_of_fame',      'Hall of Fame',      '200 Ranked battles.',                                       'battles',   4, 60),
  ('live_debut',        'Live Debut',        'First Stage battle, live on the mic.',                      'battles',   1, 70),
  ('headliner',         'Headliner',         'Won a tournament.',                                         'events',    4, 110),
  ('podium',            'Podium',            'Top 3 in a tournament.',                                    'events',    3, 120),
  ('last_one_standing', 'Last One Standing', 'Won a 7 to Smoke.',                                         'events',    4, 130),
  ('perfect_seven',     'Perfect Seven',     'Scored all 7 points in a row without leaving the stage.',   'events',    5, 140),
  ('showcase_star',     'Showcase Star',     'First place in the eliminations.',                          'events',    3, 150),
  ('top10_week',        'Top 10 of the Week','Finished a week in the top 10.',                            'ranking',   2, 210),
  ('top10_season',      'Top 10 of the Season','Finished a season in the top 10.',                        'ranking',   4, 220),
  ('season_headliner',  'Season Headliner',  'Number one of a season.',                                   'ranking',   5, 230),
  ('judge',             'Judge',             'Judged an event.',                                          'community', 1, 310),
  ('golden_ear',        'Golden Ear',        'Judged 10 events.',                                         'community', 3, 320),
  ('host',              'Host',              'Hosted an event to the end.',                               'community', 2, 330),
  ('good_vibes',        'Good Vibes',        'A year on BBX Arena without a single suspension.',          'community', 2, 340);

-- Repeatable badges (one per event or period) use context_key; one-off badges use ''.
create table public.profile_badges (
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  badge_code   text not null references public.badges (code),
  context_key  text not null default '',
  context      jsonb not null default '{}'::jsonb,
  earned_at    timestamptz not null default now(),
  primary key (profile_id, badge_code, context_key)
);
create index profile_badges_profile_idx on public.profile_badges (profile_id, earned_at desc);

alter table public.profiles
  add column featured_badge text references public.badges (code),
  add column was_suspended  boolean not null default false;

alter table public.badges         enable row level security;
alter table public.profile_badges enable row level security;
create policy "Badges are public"        on public.badges         for select using (true);
create policy "Earned badges are public" on public.profile_badges for select using (true);

-- Remember any suspension, even after it's lifted (for Good Vibes).
create or replace function public.mark_was_suspended() returns trigger
language plpgsql as $$
begin
  if new.suspended_at is not null then new.was_suspended := true; end if;
  return new;
end $$;
create trigger profiles_mark_was_suspended before update of suspended_at on public.profiles
  for each row execute function public.mark_was_suspended();

-- -----------------------------------------------------------------------------
-- Award one badge (no-op if already earned); notify and update the featured badge.
-- -----------------------------------------------------------------------------
create or replace function public.award_badge(p_profile uuid, p_code text, p_key text default '', p_context jsonb default '{}'::jsonb)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_badge  badges;
  v_new    boolean;
  v_user   text;
begin
  if p_profile is null then return false; end if;
  select * into v_badge from badges where code = p_code;
  insert into profile_badges (profile_id, badge_code, context_key, context)
  values (p_profile, p_code, coalesce(p_key, ''), coalesce(p_context, '{}'::jsonb))
  on conflict do nothing
  returning true into v_new;
  if not coalesce(v_new, false) then return false; end if;

  update profiles set featured_badge = p_code
   where id = p_profile
     and (featured_badge is null or (select rarity from badges where code = featured_badge) <= v_badge.rarity);

  if current_setting('bbx.silent_badges', true) = 'on' then return true; end if;   -- backfill: no notifications
  select username into v_user from profiles where id = p_profile;
  perform notify(p_profile, 'badge_earned', null, null,
                 jsonb_build_object('badge', p_code, 'name', v_badge.name, 'username', v_user) || coalesce(p_context, '{}'::jsonb));
  return true;
end $$;

-- -----------------------------------------------------------------------------
-- Battle badges, checked for both battlers whenever a battle finishes
-- -----------------------------------------------------------------------------
create or replace function public.check_battle_badges(p_profile uuid, p_battle uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  b        battles;
  n_all    int;
  n_ranked int;
  streak   int;
  mine     int;
  theirs   int;
begin
  if p_profile is null then return; end if;
  select * into b from battles where id = p_battle;

  select count(*) into n_all from battles
   where status = 'finished' and result in ('decision', 'draw', 'forfeit') and p_profile in (challenger_id, opponent_id);
  if n_all >= 1 then perform award_badge(p_profile, 'first_beat'); end if;

  if b.mode = 'stage' and b.result in ('decision', 'draw') then perform award_badge(p_profile, 'live_debut'); end if;

  select count(*) into n_ranked from battles
   where status = 'finished' and ranked and result in ('decision', 'draw', 'forfeit') and p_profile in (challenger_id, opponent_id);
  if n_ranked >= 50  then perform award_badge(p_profile, 'regular'); end if;
  if n_ranked >= 200 then perform award_badge(p_profile, 'hall_of_fame'); end if;

  -- current run of Ranked wins (a loss or a draw ends it)
  select count(*) into streak from (
    select sum(case when winner_id = p_profile then 0 else 1 end) over (order by finished_at desc rows unbounded preceding) as breaks
      from battles
     where status = 'finished' and ranked and result in ('decision', 'draw', 'forfeit') and p_profile in (challenger_id, opponent_id)
  ) t where breaks = 0;
  if streak >= 5  then perform award_badge(p_profile, 'in_the_groove'); end if;
  if streak >= 10 then perform award_badge(p_profile, 'encore'); end if;

  if b.ranked and b.winner_id = p_profile and b.challenger_elo_before is not null then
    mine   := case when p_profile = b.challenger_id then b.challenger_elo_before else b.opponent_elo_before end;
    theirs := case when p_profile = b.challenger_id then b.opponent_elo_before else b.challenger_elo_before end;
    if theirs - mine >= 200 then perform award_badge(p_profile, 'underdog'); end if;
  end if;
end $$;

create or replace function public.battle_badges_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.result in ('decision', 'draw', 'forfeit') then
    perform check_battle_badges(new.challenger_id, new.id);
    perform check_battle_badges(new.opponent_id, new.id);
  end if;
  return new;
end $$;
create trigger battles_badges after update of status on public.battles
  for each row when (new.status = 'finished' and old.status is distinct from 'finished')
  execute function public.battle_badges_trigger();

-- -----------------------------------------------------------------------------
-- Event badges
-- -----------------------------------------------------------------------------
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
    for r in select profile_id from event_entries where event_id = e.id and elim_place = 1 loop
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

  for r in select profile_id, final_place from event_entries where event_id = e.id and final_place between 1 and 3 loop
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
    if last_n = e.smoke_target then perform award_badge(e.champion_id, 'perfect_seven', e.id::text, ctx); end if;
  end if;
end $$;

create or replace function public.event_badges_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform check_event_badges(new.id);
  return new;
end $$;
create trigger events_badges after update of status, published_at on public.events
  for each row when ((new.status = 'finished' and old.status is distinct from 'finished')
                  or (new.published_at is not null and old.published_at is null))
  execute function public.event_badges_trigger();

-- -----------------------------------------------------------------------------
-- Period badges (weekly top 10, season top 10 and number one) and Good Vibes.
-- Runs daily; safe to repeat.
-- -----------------------------------------------------------------------------
create or replace function public.award_period_badges() returns void
language plpgsql security definer set search_path = public as $$
declare
  wk_start timestamptz := date_trunc('week', now()) - interval '7 days';
  wk_end   timestamptz := date_trunc('week', now());
  wk_key   text := to_char(wk_start, 'IYYY-"W"IW');
  s        record;
  r        record;
begin
  for r in
    select profile_id from (
      select e.profile_id, sum(e.points) pts, rank() over (order by sum(e.points) desc) rk
        from point_events e join profiles p on p.id = e.profile_id and p.deleted_at is null
       where e.created_at >= wk_start and e.created_at < wk_end
       group by e.profile_id
    ) t where rk <= 10 and pts > 0
  loop
    perform award_badge(r.profile_id, 'top10_week', wk_key, jsonb_build_object('week', wk_key));
  end loop;

  for s in select * from seasons where ends_at <= now() and ends_at > now() - interval '30 days' loop
    for r in
      select profile_id, rk from (
        select e.profile_id, sum(e.points) pts, rank() over (order by sum(e.points) desc) rk
          from point_events e join profiles p on p.id = e.profile_id and p.deleted_at is null
         where e.season_id = s.id
         group by e.profile_id
      ) t where rk <= 10 and pts > 0
    loop
      perform award_badge(r.profile_id, 'top10_season', s.id::text, jsonb_build_object('season', s.name));
      if r.rk = 1 then perform award_badge(r.profile_id, 'season_headliner', s.id::text, jsonb_build_object('season', s.name)); end if;
    end loop;
  end loop;

  for r in select id from profiles where deleted_at is null and not was_suspended and created_at <= now() - interval '1 year' loop
    perform award_badge(r.id, 'good_vibes');
  end loop;
end $$;

select cron.schedule('bbx-period-badges', '15 0 * * *', $$select public.award_period_badges()$$);

revoke execute on function public.award_badge(uuid, text, text, jsonb)  from public, anon, authenticated;
revoke execute on function public.check_battle_badges(uuid, uuid)       from public, anon, authenticated;
revoke execute on function public.check_event_badges(uuid)              from public, anon, authenticated;
revoke execute on function public.award_period_badges()                 from public, anon, authenticated;

-- The directory shows each beatboxer's featured badge.
create or replace view public.directory_entries with (security_invoker = true) as
select
  p.id, p.username, p.full_name, p.avatar_url, p.country, p.bio, p.styles, p.social_links,
  p.signature_audio_path, p.signature_waveform,
  p.elo_rating, p.peak_elo, p.wins, p.losses, p.draws, p.battles_count,
  case when p.battles_count > 0 then round(p.wins::numeric / p.battles_count, 3) end as win_rate,
  rank() over (order by p.elo_rating desc) as global_rank,
  p.created_at,
  p.featured_badge
from public.profiles p
where p.deleted_at is null;

-- -----------------------------------------------------------------------------
-- Backfill: badges for everything that already happened, without notifications.
-- -----------------------------------------------------------------------------
do $$
declare r record;
begin
  perform set_config('bbx.silent_badges', 'on', true);
  for r in select id, challenger_id, opponent_id from battles
            where status = 'finished' and result in ('decision', 'draw', 'forfeit') order by finished_at loop
    perform check_battle_badges(r.challenger_id, r.id);
    perform check_battle_badges(r.opponent_id, r.id);
  end loop;
  for r in select id from events where status = 'finished' or published_at is not null loop
    perform check_event_badges(r.id);
  end loop;
  perform award_period_badges();
  perform set_config('bbx.silent_badges', 'off', true);
end $$;
