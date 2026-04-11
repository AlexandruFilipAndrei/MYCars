create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop policy if exists "profiles_select_own_or_shared" on public.profiles;
create policy "profiles_select_own_or_shared" on public.profiles
for select using (id = auth.uid() or public.user_has_owner_access(id));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update using (id = auth.uid())
with check (id = auth.uid());

create or replace function public.get_invite_owner_profiles(owner_ids uuid[])
returns table (
  id uuid,
  full_name text
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.full_name
  from public.profiles p
  where auth.uid() is not null
    and p.id = any(owner_ids)
    and exists (
      select 1
      from public.fleet_access fa
      where fa.owner_id = p.id
        and lower(fa.invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;

revoke all on function public.get_invite_owner_profiles(uuid[]) from public;
grant execute on function public.get_invite_owner_profiles(uuid[]) to authenticated;

update public.car_photos
set file_url = regexp_replace(file_url, '^.*?/storage/v1/object/public/car-photos/', '')
where file_url like '%/storage/v1/object/public/car-photos/%';

update storage.buckets
set public = false
where id = 'car-photos';

drop policy if exists "car_photos_public_read" on storage.objects;

drop policy if exists "car_photos_authenticated_read" on storage.objects;
create policy "car_photos_authenticated_read" on storage.objects
for select to authenticated
using (
  bucket_id = 'car-photos'
  and exists (
    select 1
    from public.cars c
    where c.id::text = (storage.foldername(name))[2]
      and public.user_has_car_access(c.id)
  )
);
