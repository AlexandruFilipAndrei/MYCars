create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamp default now()
);

create table if not exists public.cars (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  license_plate text not null unique,
  brand text not null,
  model text not null,
  year integer,
  color text,
  engine_hp integer not null,
  engine_kw integer generated always as (round(engine_hp * 0.7457)) stored,
  engine_displacement integer not null,
  transmission text not null check (transmission in ('manual', 'automatic')),
  chassis_number text not null unique,
  category text default 'general' check (category in ('general', 'rent', 'uber', 'bolt', 'service_replacement', 'personal')),
  status text default 'available' check (status in ('available', 'rented', 'maintenance', 'archived')),
  purchase_price decimal,
  notes text,
  current_km integer default 0,
  archived_at timestamp,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists public.car_photos (
  id uuid primary key default gen_random_uuid(),
  car_id uuid references public.cars(id) on delete cascade,
  file_url text not null,
  description text,
  created_at timestamp default now()
);

create table if not exists public.car_documents (
  id uuid primary key default gen_random_uuid(),
  car_id uuid references public.cars(id) on delete cascade,
  type text not null check (type in ('ITP', 'RCA', 'CASCO', 'ROVINIETA', 'TALON', 'CI_VEHICUL', 'OTHER')),
  custom_name text,
  expiry_date date,
  issue_date date,
  file_url text,
  notes text,
  is_mandatory boolean default false,
  created_at timestamp default now()
);

create table if not exists public.car_reminders (
  id uuid primary key default gen_random_uuid(),
  car_id uuid references public.cars(id) on delete cascade,
  title text not null,
  description text,
  reminder_type text check (reminder_type in ('date', 'km')),
  reminder_date date,
  reminder_km integer,
  is_done boolean default false,
  created_at timestamp default now()
);

create table if not exists public.rentals (
  id uuid primary key default gen_random_uuid(),
  car_id uuid references public.cars(id) on delete cascade,
  renter_name text not null,
  renter_surname text not null,
  renter_cnp text not null,
  renter_id_photo_url text,
  start_date date not null,
  end_date date not null,
  advance_payment decimal default 0,
  status text default 'active' check (status in ('active', 'completed', 'cancelled')),
  notes text,
  km_start integer,
  km_end integer,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists public.rental_price_segments (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid references public.rentals(id) on delete cascade,
  price_per_unit decimal not null,
  price_unit text not null check (price_unit in ('day', 'week', 'month')),
  start_date date not null,
  end_date date not null,
  created_at timestamp default now()
);

create table if not exists public.rental_photos (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid references public.rentals(id) on delete cascade,
  photo_type text check (photo_type in ('pickup', 'return')),
  file_url text not null,
  created_at timestamp default now()
);

create table if not exists public.maintenance (
  id uuid primary key default gen_random_uuid(),
  car_id uuid references public.cars(id) on delete cascade,
  type text check (type in ('repair', 'investment', 'service', 'other')),
  description text not null,
  cost decimal not null default 0,
  date_performed date not null,
  km_at_service integer,
  notes text,
  created_at timestamp default now()
);

create table if not exists public.maintenance_documents (
  id uuid primary key default gen_random_uuid(),
  maintenance_id uuid references public.maintenance(id) on delete cascade,
  file_url text not null,
  file_name text,
  created_at timestamp default now()
);

create table if not exists public.fleet_access (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  invited_email text not null,
  role text check (role in ('viewer', 'editor')),
  accepted_at timestamp,
  created_at timestamp default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  car_id uuid references public.cars(id) on delete cascade,
  document_id uuid references public.car_documents(id) on delete cascade,
  title text not null,
  message text not null,
  type text check (type in ('expiry_30', 'expiry_14', 'expiry_7', 'expired')),
  is_read boolean default false,
  created_at timestamp default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.user_has_car_access(target_car_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.cars c
    left join public.fleet_access fa
      on fa.owner_id = c.owner_id
      and fa.invited_email = auth.jwt() ->> 'email'
      and fa.accepted_at is not null
    where c.id = target_car_id
      and (c.owner_id = auth.uid() or fa.id is not null)
  );
$$;

create or replace function public.user_has_owner_access(target_owner_id uuid)
returns boolean
language sql
stable
as $$
  select auth.uid() = target_owner_id
    or exists (
      select 1
      from public.fleet_access fa
      where fa.owner_id = target_owner_id
        and fa.invited_email = auth.jwt() ->> 'email'
        and fa.accepted_at is not null
    );
$$;

alter table public.profiles enable row level security;
alter table public.cars enable row level security;
alter table public.car_photos enable row level security;
alter table public.car_documents enable row level security;
alter table public.car_reminders enable row level security;
alter table public.rentals enable row level security;
alter table public.rental_price_segments enable row level security;
alter table public.rental_photos enable row level security;
alter table public.maintenance enable row level security;
alter table public.maintenance_documents enable row level security;
alter table public.fleet_access enable row level security;
alter table public.notifications enable row level security;

create policy "profiles_select_own_or_shared" on public.profiles
for select using (id = auth.uid() or public.user_has_owner_access(id));

create policy "profiles_update_own" on public.profiles
for update using (id = auth.uid());

create policy "cars_select_own_or_shared" on public.cars
for select using (public.user_has_owner_access(owner_id));

create policy "cars_insert_own" on public.cars
for insert with check (owner_id = auth.uid());

create policy "cars_update_own_or_editor" on public.cars
for update using (
  owner_id = auth.uid()
  or exists (
    select 1
    from public.fleet_access fa
    where fa.owner_id = cars.owner_id
      and fa.invited_email = auth.jwt() ->> 'email'
      and fa.role = 'editor'
      and fa.accepted_at is not null
  )
);

create policy "cars_delete_own" on public.cars
for delete using (owner_id = auth.uid());

create policy "car_photos_all" on public.car_photos
for all using (public.user_has_car_access(car_id))
with check (public.user_has_car_access(car_id));

create policy "car_documents_all" on public.car_documents
for all using (public.user_has_car_access(car_id))
with check (public.user_has_car_access(car_id));

create policy "car_reminders_all" on public.car_reminders
for all using (public.user_has_car_access(car_id))
with check (public.user_has_car_access(car_id));

create policy "rentals_all" on public.rentals
for all using (public.user_has_car_access(car_id))
with check (public.user_has_car_access(car_id));

create policy "rental_price_segments_all" on public.rental_price_segments
for all using (
  exists (
    select 1 from public.rentals r
    where r.id = rental_price_segments.rental_id
      and public.user_has_car_access(r.car_id)
  )
)
with check (
  exists (
    select 1 from public.rentals r
    where r.id = rental_price_segments.rental_id
      and public.user_has_car_access(r.car_id)
  )
);

create policy "rental_photos_all" on public.rental_photos
for all using (
  exists (
    select 1 from public.rentals r
    where r.id = rental_photos.rental_id
      and public.user_has_car_access(r.car_id)
  )
)
with check (
  exists (
    select 1 from public.rentals r
    where r.id = rental_photos.rental_id
      and public.user_has_car_access(r.car_id)
  )
);

create policy "maintenance_all" on public.maintenance
for all using (public.user_has_car_access(car_id))
with check (public.user_has_car_access(car_id));

create policy "maintenance_documents_all" on public.maintenance_documents
for all using (
  exists (
    select 1 from public.maintenance m
    where m.id = maintenance_documents.maintenance_id
      and public.user_has_car_access(m.car_id)
  )
)
with check (
  exists (
    select 1 from public.maintenance m
    where m.id = maintenance_documents.maintenance_id
      and public.user_has_car_access(m.car_id)
  )
);

create policy "fleet_access_owner_select" on public.fleet_access
for select using (owner_id = auth.uid() or invited_email = auth.jwt() ->> 'email');

create policy "fleet_access_owner_insert" on public.fleet_access
for insert with check (owner_id = auth.uid());

create policy "fleet_access_owner_update" on public.fleet_access
for update using (owner_id = auth.uid() or invited_email = auth.jwt() ->> 'email');

create policy "notifications_select_own" on public.notifications
for select using (user_id = auth.uid());

create policy "notifications_update_own" on public.notifications
for update using (user_id = auth.uid());
