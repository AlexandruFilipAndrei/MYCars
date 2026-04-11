create or replace function public.user_has_owner_write_access(target_owner_id uuid)
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
        and fa.role = 'editor'
        and fa.accepted_at is not null
    );
$$;

create or replace function public.user_has_car_write_access(target_car_id uuid)
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
      and fa.role = 'editor'
      and fa.accepted_at is not null
    where c.id = target_car_id
      and (c.owner_id = auth.uid() or fa.id is not null)
  );
$$;

drop policy if exists "cars_insert_own" on public.cars;
drop policy if exists "cars_update_own_or_editor" on public.cars;
drop policy if exists "cars_delete_own" on public.cars;

create policy "cars_insert_owner_or_editor" on public.cars
for insert with check (public.user_has_owner_write_access(owner_id));

create policy "cars_update_owner_or_editor" on public.cars
for update using (public.user_has_owner_write_access(owner_id))
with check (public.user_has_owner_write_access(owner_id));

create policy "cars_delete_owner_or_editor" on public.cars
for delete using (public.user_has_owner_write_access(owner_id));

drop policy if exists "car_photos_all" on public.car_photos;
create policy "car_photos_select" on public.car_photos
for select using (public.user_has_car_access(car_id));
create policy "car_photos_insert" on public.car_photos
for insert with check (public.user_has_car_write_access(car_id));
create policy "car_photos_update" on public.car_photos
for update using (public.user_has_car_write_access(car_id))
with check (public.user_has_car_write_access(car_id));
create policy "car_photos_delete" on public.car_photos
for delete using (public.user_has_car_write_access(car_id));

drop policy if exists "car_documents_all" on public.car_documents;
create policy "car_documents_select" on public.car_documents
for select using (public.user_has_car_access(car_id));
create policy "car_documents_insert" on public.car_documents
for insert with check (public.user_has_car_write_access(car_id));
create policy "car_documents_update" on public.car_documents
for update using (public.user_has_car_write_access(car_id))
with check (public.user_has_car_write_access(car_id));
create policy "car_documents_delete" on public.car_documents
for delete using (public.user_has_car_write_access(car_id));

drop policy if exists "car_reminders_all" on public.car_reminders;
create policy "car_reminders_select" on public.car_reminders
for select using (public.user_has_car_access(car_id));
create policy "car_reminders_insert" on public.car_reminders
for insert with check (public.user_has_car_write_access(car_id));
create policy "car_reminders_update" on public.car_reminders
for update using (public.user_has_car_write_access(car_id))
with check (public.user_has_car_write_access(car_id));
create policy "car_reminders_delete" on public.car_reminders
for delete using (public.user_has_car_write_access(car_id));

drop policy if exists "rentals_all" on public.rentals;
create policy "rentals_select" on public.rentals
for select using (public.user_has_car_access(car_id));
create policy "rentals_insert" on public.rentals
for insert with check (public.user_has_car_write_access(car_id));
create policy "rentals_update" on public.rentals
for update using (public.user_has_car_write_access(car_id))
with check (public.user_has_car_write_access(car_id));
create policy "rentals_delete" on public.rentals
for delete using (public.user_has_car_write_access(car_id));

drop policy if exists "rental_price_segments_all" on public.rental_price_segments;
create policy "rental_price_segments_select" on public.rental_price_segments
for select using (
  exists (
    select 1 from public.rentals r
    where r.id = rental_price_segments.rental_id
      and public.user_has_car_access(r.car_id)
  )
);
create policy "rental_price_segments_insert" on public.rental_price_segments
for insert with check (
  exists (
    select 1 from public.rentals r
    where r.id = rental_price_segments.rental_id
      and public.user_has_car_write_access(r.car_id)
  )
);
create policy "rental_price_segments_update" on public.rental_price_segments
for update using (
  exists (
    select 1 from public.rentals r
    where r.id = rental_price_segments.rental_id
      and public.user_has_car_write_access(r.car_id)
  )
)
with check (
  exists (
    select 1 from public.rentals r
    where r.id = rental_price_segments.rental_id
      and public.user_has_car_write_access(r.car_id)
  )
);
create policy "rental_price_segments_delete" on public.rental_price_segments
for delete using (
  exists (
    select 1 from public.rentals r
    where r.id = rental_price_segments.rental_id
      and public.user_has_car_write_access(r.car_id)
  )
);

drop policy if exists "rental_photos_all" on public.rental_photos;
create policy "rental_photos_select" on public.rental_photos
for select using (
  exists (
    select 1 from public.rentals r
    where r.id = rental_photos.rental_id
      and public.user_has_car_access(r.car_id)
  )
);
create policy "rental_photos_insert" on public.rental_photos
for insert with check (
  exists (
    select 1 from public.rentals r
    where r.id = rental_photos.rental_id
      and public.user_has_car_write_access(r.car_id)
  )
);
create policy "rental_photos_update" on public.rental_photos
for update using (
  exists (
    select 1 from public.rentals r
    where r.id = rental_photos.rental_id
      and public.user_has_car_write_access(r.car_id)
  )
)
with check (
  exists (
    select 1 from public.rentals r
    where r.id = rental_photos.rental_id
      and public.user_has_car_write_access(r.car_id)
  )
);
create policy "rental_photos_delete" on public.rental_photos
for delete using (
  exists (
    select 1 from public.rentals r
    where r.id = rental_photos.rental_id
      and public.user_has_car_write_access(r.car_id)
  )
);

drop policy if exists "maintenance_all" on public.maintenance;
create policy "maintenance_select" on public.maintenance
for select using (public.user_has_car_access(car_id));
create policy "maintenance_insert" on public.maintenance
for insert with check (public.user_has_car_write_access(car_id));
create policy "maintenance_update" on public.maintenance
for update using (public.user_has_car_write_access(car_id))
with check (public.user_has_car_write_access(car_id));
create policy "maintenance_delete" on public.maintenance
for delete using (public.user_has_car_write_access(car_id));

drop policy if exists "maintenance_documents_all" on public.maintenance_documents;
create policy "maintenance_documents_select" on public.maintenance_documents
for select using (
  exists (
    select 1 from public.maintenance m
    where m.id = maintenance_documents.maintenance_id
      and public.user_has_car_access(m.car_id)
  )
);
create policy "maintenance_documents_insert" on public.maintenance_documents
for insert with check (
  exists (
    select 1 from public.maintenance m
    where m.id = maintenance_documents.maintenance_id
      and public.user_has_car_write_access(m.car_id)
  )
);
create policy "maintenance_documents_update" on public.maintenance_documents
for update using (
  exists (
    select 1 from public.maintenance m
    where m.id = maintenance_documents.maintenance_id
      and public.user_has_car_write_access(m.car_id)
  )
)
with check (
  exists (
    select 1 from public.maintenance m
    where m.id = maintenance_documents.maintenance_id
      and public.user_has_car_write_access(m.car_id)
  )
);
create policy "maintenance_documents_delete" on public.maintenance_documents
for delete using (
  exists (
    select 1 from public.maintenance m
    where m.id = maintenance_documents.maintenance_id
      and public.user_has_car_write_access(m.car_id)
  )
);
