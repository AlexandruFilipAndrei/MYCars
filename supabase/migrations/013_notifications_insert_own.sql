do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'notifications_insert_own'
  ) then
    create policy "notifications_insert_own" on public.notifications
    for insert with check (user_id = auth.uid());
  end if;
end
$$;
