do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'buckets'
      and column_name = 'file_size_limit'
  ) then
    update storage.buckets
    set file_size_limit = 10485760
    where id in ('car-photos', 'car-documents', 'maintenance-documents');
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'buckets'
      and column_name = 'allowed_mime_types'
  ) then
    update storage.buckets
    set allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'image/gif'
    ]::text[]
    where id = 'car-photos';

    update storage.buckets
    set allowed_mime_types = array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'image/gif'
    ]::text[]
    where id in ('car-documents', 'maintenance-documents');
  end if;
end
$$;

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
  reserved_event_id uuid;
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
  values (current_user_id, target_provider, target_model)
  returning id into reserved_event_id;

  return jsonb_build_object(
    'ok', true,
    'eventId', reserved_event_id,
    'used', current_count + 1,
    'limit', target_daily_limit
  );
end;
$$;

create or replace function public.release_ai_report_usage_event(target_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  deleted_count integer;
begin
  if current_user_id is null or target_event_id is null then
    return false;
  end if;

  delete from public.ai_report_usage_events
  where id = target_event_id
    and user_id = current_user_id;

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.reserve_ai_report_usage_event(text, text, integer) from public, anon;
grant execute on function public.reserve_ai_report_usage_event(text, text, integer) to authenticated;

revoke all on function public.release_ai_report_usage_event(uuid) from public, anon;
grant execute on function public.release_ai_report_usage_event(uuid) to authenticated;
