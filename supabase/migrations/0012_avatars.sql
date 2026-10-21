-- =============================================================================
-- BBX Arena: profile photos
-- Run ONCE in the Supabase SQL Editor, after 0001 to 0011.
--
-- Photos live in a public "avatars" bucket, each person in their own folder.
-- The browser crops them square and shrinks them before upload (max 2 MB here).
-- A profile can only point at a photo in its own folder, so nobody can hot-link
-- outside images (which could track visitors).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

create policy "Avatars are public" on storage.objects for select
  using (bucket_id = 'avatars');
create policy "Upload your own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Delete your own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.check_avatar_url() returns trigger
language plpgsql as $$
begin
  if new.avatar_url is not null
     and new.avatar_url is distinct from old.avatar_url
     and position(('/storage/v1/object/public/avatars/' || new.id::text || '/') in new.avatar_url) = 0 then
    raise exception 'Upload your photo through BBX Arena.' using errcode = '22023';
  end if;
  return new;
end $$;

create trigger profiles_check_avatar before update of avatar_url on public.profiles
  for each row execute function public.check_avatar_url();
