alter table public.fleet_access
add column if not exists accepted_user_id uuid references public.profiles(id) on delete set null;

create unique index if not exists fleet_access_owner_invited_email_key
on public.fleet_access (owner_id, invited_email);

update public.fleet_access fa
set accepted_user_id = p.id
from public.profiles p
where fa.accepted_at is not null
  and fa.accepted_user_id is null
  and lower(fa.invited_email) = lower(p.email);

create or replace function public.user_has_car_access(target_car_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.cars c
    left join public.fleet_access fa
      on fa.owner_id = c.owner_id
      and fa.accepted_user_id = auth.uid()
      and fa.accepted_at is not null
    where c.id = target_car_id
      and (c.owner_id = auth.uid() or fa.id is not null)
  );
$$;

create or replace function public.user_has_owner_access(target_owner_id uuid)
returns boolean
language sql
stable
as $$
  select auth.uid() = target_owner_id
    or exists (
      select 1
      from public.fleet_access fa
      where fa.owner_id = target_owner_id
        and fa.accepted_user_id = auth.uid()
        and fa.accepted_at is not null
    );
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'fleet_access'
      and policyname = 'fleet_access_owner_delete'
  ) then
    execute '
      create policy "fleet_access_owner_delete" on public.fleet_access
      for delete using (owner_id = auth.uid() or accepted_user_id = auth.uid())
    ';
  end if;
end
$$;
