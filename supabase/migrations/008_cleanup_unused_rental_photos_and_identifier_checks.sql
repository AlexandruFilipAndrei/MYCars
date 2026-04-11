drop table if exists public.rental_photos cascade;

update public.cars
set chassis_number = upper(regexp_replace(trim(chassis_number), '\s+', '', 'g'));

do $$
begin
  if exists (
    select 1
    from public.cars
    where chassis_number !~ '^[A-HJ-NPR-Z0-9]{17}$'
  ) then
    raise exception 'Exista serii de sasiu invalide. Corecteaza-le inainte de migrare.'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'cars_chassis_number_format_check'
  ) then
    alter table public.cars
    add constraint cars_chassis_number_format_check
    check (chassis_number ~ '^[A-HJ-NPR-Z0-9]{17}$');
  end if;
end
$$;

update public.rentals
set renter_cnp = regexp_replace(trim(renter_cnp), '\s+', '', 'g');

do $$
begin
  if exists (
    select 1
    from public.rentals
    where renter_cnp !~ '^[0-9]{13}$'
  ) then
    raise exception 'Exista CNP-uri invalide in inchirieri. Corecteaza-le inainte de migrare.'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'rentals_renter_cnp_format_check'
  ) then
    alter table public.rentals
    add constraint rentals_renter_cnp_format_check
    check (renter_cnp ~ '^[0-9]{13}$');
  end if;
end
$$;
