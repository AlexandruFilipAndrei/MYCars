drop policy if exists "ai_report_usage_events_insert_own" on public.ai_report_usage_events;

revoke insert, update, delete on table public.ai_report_usage_events from public, anon, authenticated;
grant select on table public.ai_report_usage_events to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ai_report_usage_events_provider_not_blank'
  ) then
    alter table public.ai_report_usage_events
    add constraint ai_report_usage_events_provider_not_blank
    check (length(trim(provider)) > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ai_report_usage_events_model_not_blank'
  ) then
    alter table public.ai_report_usage_events
    add constraint ai_report_usage_events_model_not_blank
    check (length(trim(model)) > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'cars_purchase_price_non_negative'
  ) then
    alter table public.cars
    add constraint cars_purchase_price_non_negative
    check (purchase_price is null or purchase_price >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'cars_current_km_non_negative'
  ) then
    alter table public.cars
    add constraint cars_current_km_non_negative
    check (current_km is null or current_km >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'cars_engine_hp_positive'
  ) then
    alter table public.cars
    add constraint cars_engine_hp_positive
    check (engine_hp > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'cars_engine_displacement_positive'
  ) then
    alter table public.cars
    add constraint cars_engine_displacement_positive
    check (engine_displacement > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'cars_annual_insurance_cost_non_negative'
  ) then
    alter table public.cars
    add constraint cars_annual_insurance_cost_non_negative
    check (annual_insurance_cost >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'rentals_advance_payment_non_negative'
  ) then
    alter table public.rentals
    add constraint rentals_advance_payment_non_negative
    check (advance_payment is null or advance_payment >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'rentals_km_start_non_negative'
  ) then
    alter table public.rentals
    add constraint rentals_km_start_non_negative
    check (km_start is null or km_start >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'rentals_km_end_non_negative'
  ) then
    alter table public.rentals
    add constraint rentals_km_end_non_negative
    check (km_end is null or km_end >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'rentals_date_order'
  ) then
    alter table public.rentals
    add constraint rentals_date_order
    check (end_date >= start_date) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'rental_price_segments_price_positive'
  ) then
    alter table public.rental_price_segments
    add constraint rental_price_segments_price_positive
    check (price_per_unit > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'rental_price_segments_date_order'
  ) then
    alter table public.rental_price_segments
    add constraint rental_price_segments_date_order
    check (end_date >= start_date) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'maintenance_cost_non_negative'
  ) then
    alter table public.maintenance
    add constraint maintenance_cost_non_negative
    check (cost >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'maintenance_km_at_service_non_negative'
  ) then
    alter table public.maintenance
    add constraint maintenance_km_at_service_non_negative
    check (km_at_service is null or km_at_service >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'maintenance_service_date_order'
  ) then
    alter table public.maintenance
    add constraint maintenance_service_date_order
    check (service_end_date >= date_performed) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'fleet_reports_period_order'
  ) then
    alter table public.fleet_reports
    add constraint fleet_reports_period_order
    check (period_end >= period_start) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'fleet_reports_selected_owner_ids_not_empty'
  ) then
    alter table public.fleet_reports
    add constraint fleet_reports_selected_owner_ids_not_empty
    check (cardinality(selected_owner_ids) > 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'fleet_reports_report_is_object'
  ) then
    alter table public.fleet_reports
    add constraint fleet_reports_report_is_object
    check (jsonb_typeof(report) = 'object') not valid;
  end if;
end
$$;
