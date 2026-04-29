-- Realistic fleet seed for testing reports.
--
-- How to use:
-- 1. Change target_email to the account that should receive the cars.
-- 2. Run this file in the Supabase SQL editor.
-- 3. To delete only this seed data, set run_delete_only := true and run it again.
-- 4. If you also want to remove all fleet reports saved on that account, set
--    delete_all_target_user_reports := true. It is false by default.
--
-- Deleting the seeded cars cascades to rentals, rental_price_segments,
-- maintenance, documents, photos and document notifications. Older seed data
-- that used seed_batch in notes is also removed by the delete mode.
-- Notifications are produced by the app from RCA/ITP expiry dates. This seed
-- deliberately creates expired, 0-7 day, 8-14 day and 15-30 day documents.

do $$
declare
  target_email text := 'CHANGE_ME@example.com';
  seed_batch text := 'MYCARS_REALISTIC_FLEET_25_V1';
  run_delete_only boolean := false;
  delete_all_target_user_reports boolean := false;

  target_user_id uuid;
  car_record record;
  car_id uuid;
  rental_id uuid;
  rental_index integer;
  rental_start date;
  rental_end date;
  rental_days integer;
  daily_rate numeric;
  km_start integer;
  km_end integer;
  maintenance_start date;
  maintenance_end date;
begin
  select id
  into target_user_id
  from public.profiles
  where lower(email) = lower(target_email)
  limit 1;

  if target_user_id is null then
    raise exception 'Nu am gasit profilul cu emailul %. Creeaza contul sau schimba target_email.', target_email;
  end if;

  create temp table seed_fleet_cars (
    car_no integer primary key,
    license_plate text not null,
    brand text not null,
    model text not null,
    year integer not null,
    color text,
    engine_hp integer not null,
    engine_displacement integer not null,
    transmission text not null,
    category text not null,
    purchase_price numeric not null,
    purchase_currency text not null,
    annual_insurance_cost numeric not null,
    base_km integer not null
  ) on commit drop;

  insert into seed_fleet_cars (
    car_no,
    license_plate,
    brand,
    model,
    year,
    color,
    engine_hp,
    engine_displacement,
    transmission,
    category,
    purchase_price,
    purchase_currency,
    annual_insurance_cost,
    base_km
  )
  values
    (1, 'B-341-XFR', 'Dacia', 'Logan', 2020, 'Alb', 90, 999, 'manual', 'rent', 7600, 'EUR', 1350, 76000),
    (2, 'B-578-LMD', 'Toyota', 'Corolla', 2021, 'Alb perlat', 122, 1798, 'automatic', 'bolt', 16400, 'EUR', 2200, 92000),
    (3, 'IF-72-NPL', 'Skoda', 'Octavia', 2020, 'Gri', 150, 1968, 'automatic', 'rent', 15800, 'EUR', 2100, 118000),
    (4, 'PH-44-RVG', 'Volkswagen', 'Passat', 2019, 'Negru', 150, 1968, 'automatic', 'rent', 14200, 'EUR', 2350, 151000),
    (5, 'CT-91-KPA', 'Renault', 'Megane', 2021, 'Albastru', 115, 1461, 'manual', 'rent', 11900, 'EUR', 1750, 87000),
    (6, 'CJ-27-MLR', 'Hyundai', 'i30', 2020, 'Argintiu', 120, 1368, 'manual', 'rent', 11200, 'EUR', 1650, 104000),
    (7, 'BV-63-HND', 'Kia', 'Ceed', 2022, 'Rosu', 140, 1353, 'automatic', 'uber', 17400, 'EUR', 2250, 69000),
    (8, 'TM-18-ZOE', 'Ford', 'Focus', 2019, 'Alb', 125, 998, 'manual', 'rent', 9800, 'EUR', 1580, 132000),
    (9, 'AG-55-DAR', 'Peugeot', '308', 2021, 'Gri inchis', 130, 1499, 'automatic', 'rent', 13700, 'EUR', 1950, 83000),
    (10, 'SB-29-TRN', 'Opel', 'Astra', 2020, 'Alb', 110, 1496, 'manual', 'rent', 10500, 'EUR', 1600, 116000),
    (11, 'B-904-MBS', 'Mercedes-Benz', 'C-Class', 2018, 'Negru', 194, 1950, 'automatic', 'service_replacement', 22400, 'EUR', 3900, 176000),
    (12, 'B-612-DVL', 'BMW', 'Seria 3', 2019, 'Albastru inchis', 190, 1995, 'automatic', 'rent', 24600, 'EUR', 4100, 142000),
    (13, 'IF-84-AUD', 'Audi', 'A4', 2020, 'Gri', 190, 1968, 'automatic', 'rent', 25800, 'EUR', 4200, 133000),
    (14, 'GL-37-SLN', 'Seat', 'Leon', 2021, 'Alb', 150, 1498, 'manual', 'rent', 13800, 'EUR', 1850, 81000),
    (15, 'IS-48-MZD', 'Mazda', '3', 2020, 'Rosu metalizat', 122, 1998, 'manual', 'rent', 15100, 'EUR', 2050, 97000),
    (16, 'BH-69-QSH', 'Nissan', 'Qashqai', 2021, 'Gri', 140, 1332, 'automatic', 'rent', 18900, 'EUR', 2600, 88000),
    (17, 'B-217-YRS', 'Toyota', 'Yaris', 2022, 'Alb', 116, 1490, 'automatic', 'bolt', 14900, 'EUR', 1900, 61000),
    (18, 'VL-52-DST', 'Dacia', 'Duster', 2020, 'Portocaliu', 115, 1461, 'manual', 'rent', 12600, 'EUR', 1900, 109000),
    (19, 'B-119-GFL', 'Volkswagen', 'Golf', 2021, 'Negru', 130, 1498, 'automatic', 'uber', 16600, 'EUR', 2200, 92000),
    (20, 'HD-73-SPB', 'Skoda', 'Superb', 2019, 'Gri', 190, 1968, 'automatic', 'rent', 19600, 'EUR', 3150, 160000),
    (21, 'B-382-CVC', 'Honda', 'Civic', 2020, 'Alb', 182, 1498, 'manual', 'rent', 18100, 'EUR', 2350, 95000),
    (22, 'SM-25-VLV', 'Volvo', 'V60', 2019, 'Albastru', 190, 1969, 'automatic', 'service_replacement', 23800, 'EUR', 4300, 155000),
    (23, 'BR-61-CLJ', 'Renault', 'Clio', 2021, 'Alb', 100, 999, 'manual', 'rent', 9800, 'EUR', 1450, 74000),
    (24, 'BC-47-MND', 'Ford', 'Mondeo', 2018, 'Gri', 150, 1997, 'automatic', 'rent', 12100, 'EUR', 2600, 184000),
    (25, 'B-725-TCN', 'Hyundai', 'Tucson', 2022, 'Negru', 150, 1598, 'automatic', 'rent', 23600, 'EUR', 3100, 58000);

  if run_delete_only then
    if delete_all_target_user_reports then
      delete from public.fleet_reports
      where created_by = target_user_id;
    end if;

    delete from public.cars
    where owner_id = target_user_id
      and (
        notes like '%' || seed_batch || '%'
        or license_plate in (select license_plate from seed_fleet_cars)
      );

    raise notice 'Seed data deleted for %.', target_email;
    return;
  end if;

  if exists (
    select 1
    from public.cars
    where owner_id = target_user_id
      and (
        notes like '%' || seed_batch || '%'
        or license_plate in (select license_plate from seed_fleet_cars)
      )
  ) then
    raise exception 'Seedul % exista deja pentru %. Seteaza run_delete_only := true ca sa il stergi inainte.', seed_batch, target_email;
  end if;

  for car_record in
    select *
    from seed_fleet_cars
    order by car_no
  loop
    insert into public.cars (
      owner_id,
      license_plate,
      brand,
      model,
      year,
      color,
      engine_hp,
      chassis_number,
      engine_displacement,
      transmission,
      category,
      status,
      purchase_price,
      purchase_currency,
      annual_insurance_cost,
      notes,
      current_km,
      created_at,
      updated_at
    )
    values (
      target_user_id,
      car_record.license_plate,
      car_record.brand,
      car_record.model,
      car_record.year,
      car_record.color,
      car_record.engine_hp,
      'MYCSEED' || lpad(car_record.car_no::text, 10, '0'),
      car_record.engine_displacement,
      car_record.transmission,
      car_record.category,
      'available',
      car_record.purchase_price,
      car_record.purchase_currency,
      car_record.annual_insurance_cost,
      'Masina folosita in regim de inchiriere, cu istoric de exploatare, costuri si mentenanta documentate.',
      car_record.base_km + 42000 + (car_record.car_no * 730),
      (current_date - interval '4 years')::timestamp,
      now()
    )
    returning id into car_id;

    insert into public.car_documents (
      car_id,
      type,
      custom_name,
      expiry_date,
      issue_date,
      is_mandatory,
      notes,
      created_at
    )
    values
      (
        car_id,
        'RCA',
        'RCA anual',
        case
          when car_record.car_no in (3, 11, 22) then current_date - (2 + car_record.car_no % 5)
          when car_record.car_no in (2, 7, 13, 19, 24) then current_date + (2 + car_record.car_no % 4)
          when car_record.car_no in (5, 16, 21) then current_date + (10 + car_record.car_no % 4)
          when car_record.car_no in (8, 12, 18) then current_date + (22 + car_record.car_no % 6)
          else current_date + (55 + car_record.car_no * 5)
        end,
        current_date - (335 - car_record.car_no),
        true,
        'Polita RCA incarcata in dosarul masinii.',
        now()
      ),
      (
        car_id,
        'ITP',
        'Inspectie tehnica periodica',
        case
          when car_record.car_no in (4, 15) then current_date - (1 + car_record.car_no % 3)
          when car_record.car_no in (6, 10, 17, 23) then current_date + (5 + car_record.car_no % 3)
          when car_record.car_no in (1, 9, 20, 25) then current_date + (13 + car_record.car_no % 5)
          when car_record.car_no in (14, 18) then current_date + (24 + car_record.car_no % 4)
          else current_date + (75 + car_record.car_no * 4)
        end,
        current_date - (300 - car_record.car_no),
        true,
        'Inspectie tehnica periodica in evidenta flotei.',
        now()
      );

    for rental_index in 0..20 loop
      if car_record.car_no % 6 = 0 and rental_index % 2 = 1 then
        continue;
      end if;

      if car_record.car_no % 8 = 0 and rental_index % 3 = 0 then
        continue;
      end if;

      rental_start := ((current_date - interval '4 years')::date + (rental_index * 62) + ((car_record.car_no % 9) * 2));

      if rental_start > current_date - 95 then
        continue;
      end if;

      rental_days := 7 + ((car_record.car_no + rental_index) % 16);
      rental_end := rental_start + rental_days;
      daily_rate := case
        when car_record.category in ('bolt', 'uber') then 125 + ((car_record.car_no + rental_index) % 6) * 10
        when car_record.category = 'service_replacement' then 95 + ((car_record.car_no + rental_index) % 5) * 10
        when car_record.purchase_price >= 22000 then 220 + ((car_record.car_no + rental_index) % 5) * 20
        else 145 + ((car_record.car_no + rental_index) % 7) * 10
      end;
      km_start := car_record.base_km + (rental_index * 1750) + (car_record.car_no * 230);
      km_end := km_start + (rental_days * (95 + (car_record.car_no % 45)));

      insert into public.rentals (
        car_id,
        renter_name,
        renter_surname,
        renter_cnp,
        start_date,
        end_date,
        advance_payment,
        status,
        notes,
        km_start,
        km_end,
        created_at,
        updated_at
      )
      values (
        car_id,
        (array['Andrei','Mihai','Ioana','Alexandru','Cristian','Elena','Radu','Diana','Vlad','Sorin'])[((car_record.car_no + rental_index) % 10) + 1],
        (array['Popescu','Ionescu','Dumitrescu','Stan','Marin','Georgescu','Ilie','Tudor','Radu','Nistor'])[((car_record.car_no * 2 + rental_index) % 10) + 1],
        lpad((1900000000000::bigint + car_record.car_no * 100000 + rental_index * 137)::text, 13, '0'),
        rental_start,
        rental_end,
        round((daily_rate * rental_days * 0.25)::numeric, 2),
        'completed',
        case
          when rental_days >= 18 then 'Inchiriere pe termen mediu, client cu predare fara incidente.'
          when daily_rate >= 220 then 'Inchiriere premium, tarif mai ridicat si kilometraj moderat.'
          else 'Inchiriere standard, folosita pentru calculul veniturilor flotei.'
        end,
        km_start,
        km_end,
        rental_start::timestamp,
        rental_end::timestamp
      )
      returning id into rental_id;

      insert into public.rental_price_segments (
        rental_id,
        price_per_unit,
        price_unit,
        start_date,
        end_date,
        created_at
      )
      values (
        rental_id,
        daily_rate,
        'day',
        rental_start,
        rental_end,
        rental_start::timestamp
      );

      if rental_index % 3 = 0 then
        maintenance_start := rental_end + 10;
        maintenance_end := maintenance_start + ((car_record.car_no + rental_index) % 3);

        if maintenance_end < current_date - 45 then
          insert into public.maintenance (
            car_id,
            type,
            description,
            cost,
            date_performed,
            service_end_date,
            blocks_availability,
            km_at_service,
            notes,
            created_at
          )
          values (
            car_id,
            case when rental_index % 9 = 0 then 'investment' else 'repair' end,
            case
              when rental_index % 9 = 0 then 'Anvelope, geometrie si mici investitii de exploatare'
              when rental_index % 6 = 0 then 'Revizie periodica, filtre, ulei si diagnoza'
              else 'Interventie uzura: placute, bucse sau consumabile'
            end,
            case
              when rental_index % 9 = 0 then 1400 + car_record.car_no * 35
              when rental_index % 6 = 0 then 720 + car_record.car_no * 18
              else 430 + car_record.car_no * 14
            end,
            maintenance_start,
            maintenance_end,
            true,
            km_start + 900,
            case
              when rental_index % 9 = 0 then 'Investitie de exploatare pentru mentinerea valorii masinii.'
              when rental_index % 6 = 0 then 'Revizie periodica efectuata dupa perioada de inchiriere.'
              else 'Interventie de uzura efectuata intre doua perioade de inchiriere.'
            end,
            maintenance_start::timestamp
          );
        end if;
      end if;
    end loop;

    if car_record.car_no in (2, 7, 13, 19, 24) then
      rental_start := current_date - (3 + (car_record.car_no % 4));
      rental_end := current_date + (8 + (car_record.car_no % 8));
      rental_days := rental_end - rental_start;
      daily_rate := case
        when car_record.purchase_price >= 22000 then 260
        when car_record.category in ('bolt', 'uber') then 155
        else 175
      end;
      km_start := car_record.base_km + 40500 + car_record.car_no * 250;

      insert into public.rentals (
        car_id,
        renter_name,
        renter_surname,
        renter_cnp,
        start_date,
        end_date,
        advance_payment,
        status,
        notes,
        km_start,
        km_end,
        created_at,
        updated_at
      )
      values (
        car_id,
        (array['Marius','Ana','George','Larisa','Paul'])[((car_record.car_no % 5) + 1)],
        (array['Petrescu','Vasilescu','Munteanu','Dragomir','Neagu'])[((car_record.car_no % 5) + 1)],
        lpad((1910000000000::bigint + car_record.car_no * 100000)::text, 13, '0'),
        rental_start,
        rental_end,
        round((daily_rate * rental_days * 0.35)::numeric, 2),
        'active',
        'Inchiriere activa, contract in derulare cu client recurent.',
        km_start,
        null,
        rental_start::timestamp,
        now()
      )
      returning id into rental_id;

      insert into public.rental_price_segments (
        rental_id,
        price_per_unit,
        price_unit,
        start_date,
        end_date,
        created_at
      )
      values (
        rental_id,
        daily_rate,
        'day',
        rental_start,
        rental_end,
        rental_start::timestamp
      );

      update public.cars
      set status = 'rented',
          service_return_date = null,
          updated_at = now()
      where id = car_id;
    elsif car_record.car_no in (5, 16) then
      maintenance_start := current_date - 2;
      maintenance_end := current_date + 4;

      insert into public.maintenance (
        car_id,
        type,
        description,
        cost,
        date_performed,
        service_end_date,
        blocks_availability,
        km_at_service,
        notes,
        created_at
      )
      values (
        car_id,
        'repair',
        'Diagnoza si reparatie programata, masina indisponibila temporar',
        1850 + car_record.car_no * 45,
        maintenance_start,
        maintenance_end,
        true,
        car_record.base_km + 43000,
        'Masina este temporar indisponibila pana la finalizarea interventiei.',
        maintenance_start::timestamp
      );

      update public.cars
      set status = 'maintenance',
          service_return_date = maintenance_end,
          updated_at = now()
      where id = car_id;
    end if;
  end loop;

  raise notice 'Seed data created for %. Cars: %, seed batch: %.', target_email, (select count(*) from seed_fleet_cars), seed_batch;
end $$;
