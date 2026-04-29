create or replace function public.ensure_valid_rental()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform 1
  from public.cars c
  where c.id = new.car_id
  for update;

  if not found then
    raise exception 'Masina selectata nu exista.' using errcode = '23503';
  end if;

  if new.end_date < new.start_date then
    raise exception 'Data de sfarsit nu poate fi inaintea datei de inceput.' using errcode = '23514';
  end if;

  if new.km_start is not null and new.km_end is not null and new.km_end < new.km_start then
    raise exception 'Kilometrajul de retur nu poate fi mai mic decat cel de predare.' using errcode = '23514';
  end if;

  if new.status <> 'cancelled'
    and exists (
      select 1
      from public.rentals r
      where r.car_id = new.car_id
        and r.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
        and r.status <> 'cancelled'
        and daterange(r.start_date, r.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
    ) then
    raise exception 'Exista deja o inchiriere activa sau finalizata in perioada selectata.' using errcode = '23P01';
  end if;

  if new.status <> 'cancelled'
    and exists (
      select 1
      from public.maintenance m
      where m.car_id = new.car_id
        and m.blocks_availability = true
        and daterange(m.date_performed, m.service_end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
    ) then
    raise exception 'Masina are deja o perioada de service care o scoate din circuit in intervalul selectat.' using errcode = '23P01';
  end if;

  return new;
end;
$$;

create or replace function public.ensure_valid_maintenance()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform 1
  from public.cars c
  where c.id = new.car_id
  for update;

  if not found then
    raise exception 'Masina selectata nu exista.' using errcode = '23503';
  end if;

  if new.service_end_date < new.date_performed then
    raise exception 'Data iesirii din service nu poate fi inaintea datei interventiei.' using errcode = '23514';
  end if;

  if new.blocks_availability
    and exists (
      select 1
      from public.cars c
      where c.id = new.car_id
        and c.status = 'archived'
    ) then
    raise exception 'Nu poti scoate din circuit o masina arhivata.' using errcode = '23514';
  end if;

  if new.blocks_availability
    and exists (
      select 1
      from public.rentals r
      where r.car_id = new.car_id
        and r.status <> 'cancelled'
        and daterange(r.start_date, r.end_date, '[]') && daterange(new.date_performed, new.service_end_date, '[]')
    ) then
    raise exception 'Perioada de service care scoate masina din circuit nu poate suprapune o inchiriere.' using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists maintenance_validate_before_write on public.maintenance;
create trigger maintenance_validate_before_write
before insert or update on public.maintenance
for each row execute function public.ensure_valid_maintenance();

create or replace function public.save_rental_with_segments(
  target_id uuid,
  target_car_id uuid,
  target_renter_name text,
  target_renter_surname text,
  target_renter_cnp text,
  target_renter_id_photo_url text,
  target_start_date date,
  target_end_date date,
  target_advance_payment numeric,
  target_status text,
  target_notes text,
  target_km_start integer,
  target_km_end integer,
  target_segments jsonb
)
returns public.rentals
language plpgsql
set search_path = public
as $$
declare
  saved_rental public.rentals%rowtype;
  segment_item jsonb;
begin
  if jsonb_typeof(coalesce(target_segments, '[]'::jsonb)) <> 'array' then
    raise exception 'Segmentele de pret trebuie trimise ca lista.' using errcode = '22023';
  end if;

  if target_id is null then
    insert into public.rentals (
      car_id,
      renter_name,
      renter_surname,
      renter_cnp,
      renter_id_photo_url,
      start_date,
      end_date,
      advance_payment,
      status,
      notes,
      km_start,
      km_end,
      updated_at
    )
    values (
      target_car_id,
      target_renter_name,
      target_renter_surname,
      target_renter_cnp,
      target_renter_id_photo_url,
      target_start_date,
      target_end_date,
      coalesce(target_advance_payment, 0),
      target_status,
      target_notes,
      target_km_start,
      target_km_end,
      now()
    )
    returning * into saved_rental;
  else
    update public.rentals
    set car_id = target_car_id,
        renter_name = target_renter_name,
        renter_surname = target_renter_surname,
        renter_cnp = target_renter_cnp,
        renter_id_photo_url = target_renter_id_photo_url,
        start_date = target_start_date,
        end_date = target_end_date,
        advance_payment = coalesce(target_advance_payment, 0),
        status = target_status,
        notes = target_notes,
        km_start = target_km_start,
        km_end = target_km_end,
        updated_at = now()
    where id = target_id
    returning * into saved_rental;

    if not found then
      raise exception 'Inchirierea selectata nu exista sau nu poate fi modificata.' using errcode = '42501';
    end if;
  end if;

  delete from public.rental_price_segments
  where rental_id = saved_rental.id;

  for segment_item in
    select element
    from jsonb_array_elements(coalesce(target_segments, '[]'::jsonb)) as items(element)
  loop
    insert into public.rental_price_segments (
      rental_id,
      price_per_unit,
      price_unit,
      start_date,
      end_date
    )
    values (
      saved_rental.id,
      (segment_item ->> 'price_per_unit')::numeric,
      segment_item ->> 'price_unit',
      (segment_item ->> 'start_date')::date,
      (segment_item ->> 'end_date')::date
    );
  end loop;

  return saved_rental;
end;
$$;

revoke all on function public.save_rental_with_segments(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  date,
  date,
  numeric,
  text,
  text,
  integer,
  integer,
  jsonb
) from public, anon;
grant execute on function public.save_rental_with_segments(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  date,
  date,
  numeric,
  text,
  text,
  integer,
  integer,
  jsonb
) to authenticated;
