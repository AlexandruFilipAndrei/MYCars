alter table public.maintenance
add column if not exists expected_completion_date date;
