alter table public.cars
add column if not exists purchase_currency text;

update public.cars
set purchase_currency = coalesce(purchase_currency, 'RON');

alter table public.cars
alter column purchase_currency set default 'RON';

alter table public.cars
alter column purchase_currency set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cars_purchase_currency_check'
  ) then
    alter table public.cars
    add constraint cars_purchase_currency_check
    check (purchase_currency in ('RON', 'EUR', 'USD', 'GBP'));
  end if;
end
$$;

update public.cars
set license_plate = upper(regexp_replace(trim(license_plate), '\s+', ' ', 'g')),
    chassis_number = upper(regexp_replace(trim(chassis_number), '\s+', '', 'g'));

do $$
begin
  if exists (
    select 1
    from (
      select owner_id, upper(regexp_replace(license_plate, '[^A-Za-z0-9]+', '', 'g')) as normalized_license_plate
      from public.cars
    ) duplicates
    group by owner_id, normalized_license_plate
    having count(*) > 1
  ) then
    raise exception 'Exista numere de inmatriculare duplicate in aceeasi flota. Rezolva duplicatele inainte de migrare.'
      using errcode = '23505';
  end if;

  if exists (
    select 1
    from (
      select owner_id, upper(regexp_replace(chassis_number, '\s+', '', 'g')) as normalized_chassis_number
      from public.cars
    ) duplicates
    group by owner_id, normalized_chassis_number
    having count(*) > 1
  ) then
    raise exception 'Exista serii de sasiu duplicate in aceeasi flota. Rezolva duplicatele inainte de migrare.'
      using errcode = '23505';
  end if;
end
$$;

alter table public.cars
drop constraint if exists cars_license_plate_key;

alter table public.cars
drop constraint if exists cars_chassis_number_key;

drop index if exists cars_owner_license_plate_key;
create unique index if not exists cars_owner_license_plate_key
on public.cars (owner_id, upper(regexp_replace(license_plate, '[^A-Za-z0-9]+', '', 'g')));

drop index if exists cars_owner_chassis_number_key;
create unique index if not exists cars_owner_chassis_number_key
on public.cars (owner_id, upper(regexp_replace(chassis_number, '\s+', '', 'g')));

insert into storage.buckets (id, name, public)
values
  ('car-photos', 'car-photos', true),
  ('maintenance-documents', 'maintenance-documents', false)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;

drop policy if exists "car_photos_public_read" on storage.objects;
create policy "car_photos_public_read" on storage.objects
for select to public
using (bucket_id = 'car-photos');

drop policy if exists "car_photos_authenticated_upload" on storage.objects;
create policy "car_photos_authenticated_upload" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'car-photos'
  and exists (
    select 1
    from public.cars c
    where c.id::text = (storage.foldername(name))[2]
      and public.user_has_car_write_access(c.id)
  )
);

drop policy if exists "car_photos_authenticated_update" on storage.objects;
create policy "car_photos_authenticated_update" on storage.objects
for update to authenticated
using (
  bucket_id = 'car-photos'
  and exists (
    select 1
    from public.cars c
    where c.id::text = (storage.foldername(name))[2]
      and public.user_has_car_write_access(c.id)
  )
)
with check (
  bucket_id = 'car-photos'
  and exists (
    select 1
    from public.cars c
    where c.id::text = (storage.foldername(name))[2]
      and public.user_has_car_write_access(c.id)
  )
);

drop policy if exists "car_photos_authenticated_delete" on storage.objects;
create policy "car_photos_authenticated_delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'car-photos'
  and exists (
    select 1
    from public.cars c
    where c.id::text = (storage.foldername(name))[2]
      and public.user_has_car_write_access(c.id)
  )
);

drop policy if exists "maintenance_documents_authenticated_read" on storage.objects;
create policy "maintenance_documents_authenticated_read" on storage.objects
for select to authenticated
using (
  bucket_id = 'maintenance-documents'
  and exists (
    select 1
    from public.maintenance m
    where m.id::text = (storage.foldername(name))[2]
      and public.user_has_car_access(m.car_id)
  )
);

drop policy if exists "maintenance_documents_authenticated_upload" on storage.objects;
create policy "maintenance_documents_authenticated_upload" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'maintenance-documents'
  and exists (
    select 1
    from public.maintenance m
    where m.id::text = (storage.foldername(name))[2]
      and public.user_has_car_write_access(m.car_id)
  )
);

drop policy if exists "maintenance_documents_authenticated_update" on storage.objects;
create policy "maintenance_documents_authenticated_update" on storage.objects
for update to authenticated
using (
  bucket_id = 'maintenance-documents'
  and exists (
    select 1
    from public.maintenance m
    where m.id::text = (storage.foldername(name))[2]
      and public.user_has_car_write_access(m.car_id)
  )
)
with check (
  bucket_id = 'maintenance-documents'
  and exists (
    select 1
    from public.maintenance m
    where m.id::text = (storage.foldername(name))[2]
      and public.user_has_car_write_access(m.car_id)
  )
);

drop policy if exists "maintenance_documents_authenticated_delete" on storage.objects;
create policy "maintenance_documents_authenticated_delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'maintenance-documents'
  and exists (
    select 1
    from public.maintenance m
    where m.id::text = (storage.foldername(name))[2]
      and public.user_has_car_write_access(m.car_id)
  )
);
