-- =============================================================================
-- BBX Arena: push notifications
-- Run ONCE in the Supabase SQL Editor, after 0001, 0002 and 0003.
--
-- Every new row in notifications makes the database call the website
-- (POST /api/push), which delivers it to the person's phones and computers.
-- The last line of this script shows a secret: copy it into Vercel as
-- PUSH_WEBHOOK_SECRET so the website only accepts calls from your database.
-- =============================================================================

create extension if not exists pg_net with schema extensions;

-- -----------------------------------------------------------------------------
-- Settings the database needs (single row, editable in the Table Editor)
-- -----------------------------------------------------------------------------
create table public.app_settings (
  id                  boolean primary key default true check (id),
  site_url            text not null,
  push_webhook_secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
insert into public.app_settings (site_url) values ('https://bbx-arena-site.vercel.app');

-- Private: no policies, so browsers can't read the secret.
alter table public.app_settings enable row level security;

-- -----------------------------------------------------------------------------
-- Devices that accepted notifications (one row per browser or phone)
-- -----------------------------------------------------------------------------
create table public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy "See own devices" on public.push_subscriptions for select using (user_id = auth.uid());

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Log in to turn on notifications.' using errcode = '28000';
  end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then
    raise exception 'This browser sent an invalid push address.' using errcode = '22023';
  end if;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end $$;

create or replace function public.delete_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- New notification -> call the website (asynchronous: never slows the battle)
-- -----------------------------------------------------------------------------
create or replace function public.dispatch_push() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  s app_settings;
begin
  if not exists (select 1 from push_subscriptions where user_id = new.user_id) then
    return new;
  end if;
  select * into s from app_settings limit 1;
  if s.site_url is null then
    return new;
  end if;
  perform net.http_post(
    url     := rtrim(s.site_url, '/') || '/api/push',
    body    := jsonb_build_object('notification_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', s.push_webhook_secret)
  );
  return new;
end $$;

create trigger notifications_dispatch_push after insert on public.notifications
  for each row execute function public.dispatch_push();

revoke execute on function public.dispatch_push() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Copy this value into Vercel as PUSH_WEBHOOK_SECRET
-- -----------------------------------------------------------------------------
select push_webhook_secret as "Copy this into Vercel as PUSH_WEBHOOK_SECRET" from public.app_settings;
