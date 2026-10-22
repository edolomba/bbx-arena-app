-- =============================================================================
-- Beatbox Arena: events with several categories
-- Run ONCE in the Supabase SQL Editor, after 0001 to 0014.
--
-- An EVENT carries the identity: logo, name, edition, organizer, dates,
-- description and schedule. It holds one or more CATEGORIES (Open, Junior,
-- Tag team…); each category is a full tournament with its own registrations,
-- judges, eliminations and bracket (the existing tournament engine).
-- Existing events become "event + one category" automatically.
-- =============================================================================

create table public.event_groups (
  id           uuid primary key default gen_random_uuid(),
  host_id      uuid not null references public.profiles (id),
  name         text not null check (char_length(name) between 3 and 80),
  edition      text check (char_length(edition) <= 24),            -- "2026", "Vol.3", "S1 #3"
  organizer    text check (char_length(organizer) <= 80),          -- crew, academy or brand
  description  text check (char_length(description) <= 3000),
  logo_url     text,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  created_at   timestamptz not null default now(),
  check (ends_at >= starts_at)
);
create index event_groups_dates_idx on public.event_groups (starts_at desc);

create table public.event_sessions (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.event_groups (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 80),
  category_id  uuid references public.events (id) on delete set null,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  check (ends_at > starts_at)
);
create index event_sessions_group_idx on public.event_sessions (group_id, starts_at);

alter table public.events
  add column group_id      uuid references public.event_groups (id) on delete cascade,
  add column category_name text check (char_length(category_name) <= 40),
  add column audience      text check (char_length(audience) <= 60);
create index events_group_idx on public.events (group_id);

alter table public.event_groups   enable row level security;
alter table public.event_sessions enable row level security;
create policy "Events are public"   on public.event_groups   for select using (true);
create policy "Schedules are public" on public.event_sessions for select using (true);

-- -----------------------------------------------------------------------------
-- Logos: public bucket, each host in their own folder; a logo must come from it.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-logos', 'event-logos', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;
create policy "Event logos are public" on storage.objects for select using (bucket_id = 'event-logos');
create policy "Hosts upload event logos" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-logos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Hosts delete event logos" on storage.objects for delete to authenticated
  using (bucket_id = 'event-logos' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.event_group_for_host(p_group uuid) returns public.event_groups
language plpgsql security definer set search_path = public as $$
declare g event_groups;
begin
  select * into g from event_groups where id = p_group for update;
  if not found then raise exception 'This event doesn''t exist.' using errcode = 'P0002'; end if;
  if g.host_id is distinct from auth.uid() then raise exception 'Only the host can do that.' using errcode = '42501'; end if;
  return g;
end $$;

-- Create or edit the event's identity. Dates are the event's first and last day.
create or replace function public.save_event_group(
  p_group        uuid,            -- null = create
  p_name         text,
  p_edition      text,
  p_organizer    text,
  p_description  text,
  p_starts_at    timestamptz,
  p_ends_at      timestamptz,
  p_logo_url     text default null,
  p_keep_logo    boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid := p_group;
begin
  if v_uid is null then raise exception 'Sign in to create an event.' using errcode = '28000'; end if;
  if exists (select 1 from profiles where id = v_uid and (suspended_at is not null or deleted_at is not null)) then
    raise exception 'This account is suspended.' using errcode = '42501';
  end if;
  if p_ends_at < p_starts_at then raise exception 'The event can''t end before it starts.' using errcode = '22023'; end if;
  if p_logo_url is not null and position(('/storage/v1/object/public/event-logos/' || v_uid::text || '/') in p_logo_url) = 0 then
    raise exception 'Upload the logo through Beatbox Arena.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into event_groups (host_id, name, edition, organizer, description, logo_url, starts_at, ends_at)
    values (v_uid, btrim(p_name), nullif(btrim(p_edition), ''), nullif(btrim(p_organizer), ''),
            nullif(btrim(p_description), ''), p_logo_url, p_starts_at, p_ends_at)
    returning id into v_id;
  else
    perform event_group_for_host(v_id);
    update event_groups set name = btrim(p_name), edition = nullif(btrim(p_edition), ''),
           organizer = nullif(btrim(p_organizer), ''), description = nullif(btrim(p_description), ''),
           starts_at = p_starts_at, ends_at = p_ends_at,
           logo_url = case when p_keep_logo and p_logo_url is null then logo_url else p_logo_url end
     where id = v_id;
  end if;
  return v_id;
end $$;

-- Replace the whole schedule at once: [{title, starts_at, ends_at, category_id?}, ...]
create or replace function public.save_event_schedule(p_group uuid, p_sessions jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform event_group_for_host(p_group);
  if jsonb_array_length(coalesce(p_sessions, '[]'::jsonb)) > 40 then
    raise exception 'A schedule can have up to 40 sessions.' using errcode = '22023';
  end if;
  delete from event_sessions where group_id = p_group;
  insert into event_sessions (group_id, title, category_id, starts_at, ends_at)
  select p_group, btrim(s->>'title'),
         (select e.id from events e where e.id = nullif(s->>'category_id', '')::uuid and e.group_id = p_group),
         (s->>'starts_at')::timestamptz, (s->>'ends_at')::timestamptz
    from jsonb_array_elements(coalesce(p_sessions, '[]'::jsonb)) s;
end $$;

-- A new category inside an event: a full tournament (same rules as before).
create or replace function public.create_category(
  p_group                  uuid,
  p_category               text,
  p_audience               text,
  p_max_participants       int,
  p_advance_count          int,
  p_judges                 text[],
  p_registration_hours     int     default 72,
  p_main_format            text    default 'knockout',
  p_showcase_seconds       int     default 60,
  p_battle_round_seconds   int     default 45,
  p_battle_rounds          int     default 1,
  p_judge_vote_seconds     int     default 15,
  p_ranked                 boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  g    event_groups := event_group_for_host(p_group);
  v_id uuid;
begin
  if char_length(btrim(coalesce(p_category, ''))) not between 1 and 40 then
    raise exception 'Give the category a name (up to 40 characters).' using errcode = '22023';
  end if;
  if (select count(*) from events where group_id = g.id) >= 12 then
    raise exception 'An event can have up to 12 categories.' using errcode = '22023';
  end if;
  v_id := create_event(
    left(g.name || coalesce(' ' || g.edition, '') || ' · ' || btrim(p_category), 80),
    p_max_participants, p_advance_count, p_judges, p_registration_hours, null, p_main_format,
    p_showcase_seconds, p_battle_round_seconds, p_battle_rounds, p_judge_vote_seconds, p_ranked);
  update events set group_id = g.id, category_name = btrim(p_category), audience = nullif(btrim(p_audience), '')
   where id = v_id;
  return v_id;
end $$;

-- Every existing event becomes an event with a single "Open" category.
insert into event_groups (id, host_id, name, description, starts_at, ends_at, created_at)
select gen_random_uuid(), e.host_id, e.title, e.description, e.created_at,
       greatest(coalesce(e.finished_at, e.registration_closes_at + interval '7 days'), e.created_at), e.created_at
  from events e where e.group_id is null;
update events e set group_id = g.id, category_name = coalesce(e.category_name, 'Open')
  from event_groups g
 where e.group_id is null and g.host_id = e.host_id and g.name = e.title and g.created_at = e.created_at;

revoke execute on function public.event_group_for_host(uuid) from public, anon, authenticated;
alter publication supabase_realtime add table public.event_groups, public.event_sessions;
