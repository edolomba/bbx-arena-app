-- =============================================================================
-- Beatbox Arena: feedback from users (bugs, ideas) during the beta
-- Run ONCE in the Supabase SQL Editor, after 0001 to 0015.
-- Only signed-in users can send (10 per day each); only moderators can read.
-- =============================================================================

create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid references public.profiles (id) on delete set null,
  kind        text not null check (kind in ('bug', 'idea', 'other')),
  message     text not null check (char_length(message) between 5 and 3000),
  page        text check (char_length(page) <= 300),
  device      text check (char_length(device) <= 500),
  status      text not null default 'new' check (status in ('new', 'read', 'done')),
  created_at  timestamptz not null default now()
);
create index feedback_status_idx on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;
create policy "Moderators read feedback" on public.feedback for select using (public.is_admin());

create or replace function public.send_feedback(p_kind text, p_message text, p_page text default null, p_device text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then raise exception 'Log in to send feedback.' using errcode = '28000'; end if;
  if (select count(*) from feedback where profile_id = v_uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You''ve sent a lot of feedback today. Thank you! Try again tomorrow.' using errcode = '54000';
  end if;
  insert into feedback (profile_id, kind, message, page, device)
  values (v_uid, p_kind, btrim(p_message), nullif(left(btrim(coalesce(p_page, '')), 300), ''), nullif(left(coalesce(p_device, ''), 500), ''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_set_feedback_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Moderators only.' using errcode = '42501'; end if;
  update feedback set status = p_status where id = p_id;
end $$;
