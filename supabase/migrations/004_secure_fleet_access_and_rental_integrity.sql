create or replace function public.accept_fleet_invite(target_invite_id uuid, target_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
begin
  if auth.uid() is null then
    raise exception 'Autentificare necesara.' using errcode = '42501';
  end if;

  normalized_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  update public.fleet_access
  set accepted_at = coalesce(accepted_at, now()),
      accepted_user_id = coalesce(accepted_user_id, auth.uid())
  where id = target_invite_id
    and owner_id = target_owner_id
    and lower(invited_email) = normalized_email
    and (accepted_user_id is null or accepted_user_id = auth.uid());

  if not found then
    raise exception 'Invitatia nu poate fi acceptata.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.accept_fleet_invite(uuid, uuid) from public;
grant execute on function public.accept_fleet_invite(uuid, uuid) to authenticated;

create or replace function public.remove_fleet_access(target_invite_id uuid, target_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
begin
  if auth.uid() is null then
    raise exception 'Autentificare necesara.' using errcode = '42501';
  end if;

  normalized_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  delete from public.fleet_access
  where id = target_invite_id
    and owner_id = target_owner_id
    and (
      owner_id = auth.uid()
      or (
        lower(invited_email) = normalized_email
        and (accepted_user_id is null or accepted_user_id = auth.uid())
      )
    );

  if not found then
    raise exception 'Invitatia nu poate fi eliminata.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.remove_fleet_access(uuid, uuid) from public;
grant execute on function public.remove_fleet_access(uuid, uuid) to authenticated;

drop policy if exists "fleet_access_owner_update" on public.fleet_access;
create policy "fleet_access_owner_update" on public.fleet_access
for update using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create or replace function public.ensure_valid_rental()
returns trigger
language plpgsql
set search_path = public
as $$
begin
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

  return new;
end;
$$;

drop trigger if exists rentals_validate_before_write on public.rentals;
create trigger rentals_validate_before_write
before insert or update on public.rentals
for each row execute function public.ensure_valid_rental();

create or replace function public.ensure_valid_rental_price_segment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  rental_record public.rentals%rowtype;
begin
  if new.end_date < new.start_date then
    raise exception 'Segmentul de pret nu poate avea data de sfarsit inaintea celei de inceput.' using errcode = '23514';
  end if;

  select *
  into rental_record
  from public.rentals
  where id = new.rental_id;

  if rental_record.id is null then
    raise exception 'Inchirierea selectata nu exista.' using errcode = '23503';
  end if;

  if new.start_date < rental_record.start_date or new.end_date > rental_record.end_date then
    raise exception 'Segmentul de pret trebuie sa fie inclus in perioada inchirierii.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.rental_price_segments segment
    where segment.rental_id = new.rental_id
      and segment.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and daterange(segment.start_date, segment.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
  ) then
    raise exception 'Segmentele de pret nu se pot suprapune.' using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists rental_price_segments_validate_before_write on public.rental_price_segments;
create trigger rental_price_segments_validate_before_write
before insert or update on public.rental_price_segments
for each row execute function public.ensure_valid_rental_price_segment();
