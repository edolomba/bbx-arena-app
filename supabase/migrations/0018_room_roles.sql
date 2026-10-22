-- =============================================================================
-- Beatbox Arena: live rooms like a voice channel
-- Run ONCE in the Supabase SQL Editor, after 0001 to 0017.
--
-- In stage battles and live events, the host, the judges and the battlers can
-- talk (their own mute button); the audience listens. The host can invite
-- someone from the audience to speak, and kick or ban people from the room.
-- =============================================================================

create table public.room_roles (
  room_kind   text not null check (room_kind in ('battle', 'event')),
  room_id     uuid not null,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  role        text not null check (role in ('banned', 'speaker')),
  created_at  timestamptz not null default now(),
  primary key (room_kind, room_id, profile_id)
);
alter table public.room_roles enable row level security;
create policy "Room roles are public" on public.room_roles for select using (true);

/** The caller's role in a live room: host, judge, battler, speaker, audience or banned. */
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
    if exists (select 1 from battles where id = p_room and v_uid in (challenger_id, opponent_id)) then return 'battler'; end if;
    if exists (select 1 from battle_judges where battle_id = p_room and judge_id = v_uid and active) then return 'judge'; end if;
  else
    if exists (select 1 from events where id = p_room and host_id = v_uid) then return 'host'; end if;
    if exists (select 1 from event_judges where event_id = p_room and judge_id = v_uid and active) then return 'judge'; end if;
    if exists (select 1 from event_entries where event_id = p_room and profile_id = v_uid and status in ('registered', 'qualified')) then return 'battler'; end if;
  end if;
  return coalesce(v_role, 'audience');
end $$;

/** Host only: invite to speak ('speaker'), ban ('banned'), or clear (null). */
create or replace function public.set_room_role(p_kind text, p_room uuid, p_profile uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_host uuid;
begin
  if p_kind = 'battle' then select host_id into v_host from battles where id = p_room;
  elsif p_kind = 'event' then select host_id into v_host from events where id = p_room;
  else raise exception 'Unknown room.' using errcode = '22023';
  end if;
  if v_host is null or v_host is distinct from auth.uid() then
    raise exception 'Only the host can do that.' using errcode = '42501';
  end if;
  if p_role is not null and p_role not in ('banned', 'speaker') then
    raise exception 'Unknown role.' using errcode = '22023';
  end if;
  if p_role = 'banned' and (
       p_profile = v_host
    or (p_kind = 'battle' and exists (select 1 from battles where id = p_room and p_profile in (challenger_id, opponent_id)))
    or (p_kind = 'battle' and exists (select 1 from battle_judges where battle_id = p_room and judge_id = p_profile and active))
    or (p_kind = 'event' and exists (select 1 from event_judges where event_id = p_room and judge_id = p_profile and active))
    or (p_kind = 'event' and exists (select 1 from event_entries where event_id = p_room and profile_id = p_profile and status in ('registered', 'qualified')))
  ) then
    raise exception 'Battlers, judges and the host can’t be banned from their own room. Mute them instead.' using errcode = '22023';
  end if;
  if p_role is null then
    delete from room_roles where room_kind = p_kind and room_id = p_room and profile_id = p_profile;
  else
    insert into room_roles (room_kind, room_id, profile_id, role) values (p_kind, p_room, p_profile, p_role)
    on conflict (room_kind, room_id, profile_id) do update set role = excluded.role, created_at = now();
  end if;
end $$;
