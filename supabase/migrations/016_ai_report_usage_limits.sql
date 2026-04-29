create table if not exists public.ai_report_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  provider text not null,
  model text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_report_usage_events_user_created_at_idx
  on public.ai_report_usage_events (user_id, created_at desc);

alter table public.ai_report_usage_events enable row level security;

drop policy if exists "ai_report_usage_events_select_own" on public.ai_report_usage_events;
create policy "ai_report_usage_events_select_own" on public.ai_report_usage_events
for select using (user_id = auth.uid());

drop policy if exists "ai_report_usage_events_insert_own" on public.ai_report_usage_events;
create policy "ai_report_usage_events_insert_own" on public.ai_report_usage_events
for insert with check (user_id = auth.uid());

create or replace function public.reserve_ai_report_usage_event(
  target_provider text,
  target_model text,
  target_daily_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_count integer;
  window_start timestamptz := date_trunc('day', timezone('utc', now())) at time zone 'utc';
  window_end timestamptz := window_start + interval '1 day';
begin
  if current_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'Nu exista o sesiune valida pentru generarea AI.'
    );
  end if;

  if target_daily_limit < 1 then
    return jsonb_build_object(
      'ok', false,
      'message', 'Limita interna pentru rapoarte AI nu este configurata corect.'
    );
  end if;

  lock table public.ai_report_usage_events in exclusive mode;

  select count(*)::integer
  into current_count
  from public.ai_report_usage_events
  where provider = target_provider
    and created_at >= window_start
    and created_at < window_end;

  if current_count >= target_daily_limit then
    return jsonb_build_object(
      'ok', false,
      'used', current_count,
      'limit', target_daily_limit,
      'message', format('Limita interna pentru rapoarte AI a fost atinsa azi (%s/zi).', target_daily_limit)
    );
  end if;

  insert into public.ai_report_usage_events (user_id, provider, model)
  values (current_user_id, target_provider, target_model);

  return jsonb_build_object(
    'ok', true,
    'used', current_count + 1,
    'limit', target_daily_limit
  );
end;
$$;

revoke all on function public.reserve_ai_report_usage_event(text, text, integer) from public, anon;
grant execute on function public.reserve_ai_report_usage_event(text, text, integer) to authenticated;
