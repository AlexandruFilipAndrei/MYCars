alter table public.cars
add column if not exists annual_insurance_cost decimal not null default 0;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'maintenance'
      and column_name = 'expected_completion_date'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'maintenance'
      and column_name = 'service_end_date'
  ) then
    alter table public.maintenance rename column expected_completion_date to service_end_date;
  end if;
end $$;

alter table public.maintenance
add column if not exists service_end_date date;

alter table public.maintenance
add column if not exists blocks_availability boolean not null default false;

update public.maintenance
set blocks_availability = true
where service_end_date is not null;

update public.maintenance
set service_end_date = coalesce(service_end_date, date_performed)
where service_end_date is null;

alter table public.maintenance
alter column service_end_date set not null;

create table if not exists public.fleet_reports (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  period_kind text not null check (period_kind in ('90d', '180d', '365d', 'all')),
  period_start date not null,
  period_end date not null,
  selected_owner_ids uuid[] not null default '{}'::uuid[],
  scoring_version text not null,
  ai_provider text,
  ai_model text,
  report jsonb not null,
  created_at timestamp not null default now()
);

create index if not exists fleet_reports_created_by_created_at_idx
  on public.fleet_reports (created_by, created_at desc);

alter table public.fleet_reports enable row level security;

drop policy if exists "fleet_reports_select_own" on public.fleet_reports;
create policy "fleet_reports_select_own" on public.fleet_reports
for select using (created_by = auth.uid());

drop policy if exists "fleet_reports_insert_own" on public.fleet_reports;
create policy "fleet_reports_insert_own" on public.fleet_reports
for insert with check (created_by = auth.uid());

drop policy if exists "fleet_reports_delete_own" on public.fleet_reports;
create policy "fleet_reports_delete_own" on public.fleet_reports
for delete using (created_by = auth.uid());
