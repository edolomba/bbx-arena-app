-- =============================================================================
-- Beatbox Arena: clean start before launch
-- Deletes ALL battles and ALL events (with everything attached to them) and
-- puts every profile back to the starting rating, zero points and no badges.
-- Accounts, profiles, photos, languages and settings are kept.
--
-- Run it ONCE in the Supabase SQL Editor. It runs as a single transaction:
-- either everything is reset, or nothing changes.
-- Audio files must then be deleted from Storage (see the note at the end).
-- =============================================================================
begin;

-- 1. Events: categories, registrations, judges, showcases, rankings, brackets, schedules
delete from public.event_groups;
delete from public.events;

-- 2. Battles: rounds, votes, judges, rating history, points, reports, notifications
delete from public.battles;

-- 3. Anything left over that belonged to them
delete from public.point_events;
delete from public.elo_history;
delete from public.profile_badges;
delete from public.notifications where kind::text in ('badge_earned', 'event_update', 'event_judge_invited');

-- 4. Everyone starts again from the same line
update public.profiles
   set elo_rating = 1200, peak_elo = 1200,
       wins = 0, losses = 0, draws = 0,
       total_points = 0, weekly_points = 0, season_points = 0,
       featured_badge = null;

commit;

-- What's left (everything should be 0, except profiles)
select
  (select count(*) from public.battles)        as battles,
  (select count(*) from public.events)         as event_categories,
  (select count(*) from public.event_groups)   as events,
  (select count(*) from public.point_events)   as point_events,
  (select count(*) from public.profile_badges) as badges,
  (select count(*) from public.profiles where elo_rating <> 1200 or total_points <> 0) as profiles_not_reset,
  (select count(*) from public.profiles)       as profiles_kept;

-- NOTE: the audio files stay in Storage until you delete them there:
-- Storage -> battle-audio -> select all folders -> Delete.
