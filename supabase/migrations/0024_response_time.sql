-- =============================================================================
-- Beatbox Arena: choose the response time of take-turns battles
-- Run ONCE in the Supabase SQL Editor, after 0001 to 0023.
-- 1, 3, 12 or 24 hours to accept and to answer each turn (24 by default).
-- =============================================================================

-- Safety net for every battle: a response window between 1 and 48 hours.
create or replace function public.check_response_window() returns trigger
language plpgsql as $$
begin
  if new.response_window < interval '1 hour' or new.response_window > interval '48 hours' then
    raise exception 'The response time must be between 1 and 48 hours.' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger battles_check_response_window before insert on public.battles
  for each row execute function public.check_response_window();

drop function if exists public.create_tag_battle(uuid, text, uuid, int, int, int, boolean, boolean);

create or replace function public.create_tag_battle(
  p_team            uuid    default null,   -- my fixed Tag Team, or null for a casual duo
  p_partner         text    default null,   -- casual duo: my partner's @handle, or null to leave the seat open
  p_opponent_team   uuid    default null,   -- challenge this fixed Tag Team, or null for an open challenge
  p_round_duration  int     default 60,
  p_rounds          int     default 1,
  p_voting_hours    int     default 24,
  p_ranked          boolean default true,
  p_is_listed       boolean default true,
  p_response_hours  int     default 24
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
          make_interval(hours => p_response_hours), make_interval(hours => p_voting_hours),
          now() + case when v_opp is null then interval '7 days' else make_interval(hours => p_response_hours) end,
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
