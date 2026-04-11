drop policy if exists "profiles_select_own_or_shared" on public.profiles;

create policy "profiles_select_own_or_shared" on public.profiles
for select using (
  id = auth.uid()
  or public.user_has_owner_access(id)
  or exists (
    select 1
    from public.fleet_access fa
    where fa.owner_id = profiles.id
      and lower(fa.invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);
