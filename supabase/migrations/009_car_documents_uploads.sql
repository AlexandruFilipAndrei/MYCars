insert into storage.buckets (id, name, public)
values ('car-documents', 'car-documents', false)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;

drop policy if exists "car_documents_authenticated_read" on storage.objects;
create policy "car_documents_authenticated_read" on storage.objects
for select to authenticated
using (
  bucket_id = 'car-documents'
  and exists (
    select 1
    from public.cars c
    where c.id::text = (storage.foldername(name))[2]
      and public.user_has_car_access(c.id)
  )
);

drop policy if exists "car_documents_authenticated_upload" on storage.objects;
create policy "car_documents_authenticated_upload" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'car-documents'
  and exists (
    select 1
    from public.cars c
    where c.id::text = (storage.foldername(name))[2]
      and public.user_has_car_write_access(c.id)
  )
);

drop policy if exists "car_documents_authenticated_update" on storage.objects;
create policy "car_documents_authenticated_update" on storage.objects
for update to authenticated
using (
  bucket_id = 'car-documents'
  and exists (
    select 1
    from public.cars c
    where c.id::text = (storage.foldername(name))[2]
      and public.user_has_car_write_access(c.id)
  )
)
with check (
  bucket_id = 'car-documents'
  and exists (
    select 1
    from public.cars c
    where c.id::text = (storage.foldername(name))[2]
      and public.user_has_car_write_access(c.id)
  )
);

drop policy if exists "car_documents_authenticated_delete" on storage.objects;
create policy "car_documents_authenticated_delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'car-documents'
  and exists (
    select 1
    from public.cars c
    where c.id::text = (storage.foldername(name))[2]
      and public.user_has_car_write_access(c.id)
  )
);
