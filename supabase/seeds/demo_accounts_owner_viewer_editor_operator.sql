-- Demo seed: 4 linked accounts (owner / viewer / editor / operator).
--
-- Purpose: populate realistic fleet data for a live demo that also proves
-- fleet access is NOT transitive:
--   owner  -> viewer   (role viewer)
--   owner  -> editor   (role editor)
--   viewer -> operator (role editor)
--   there is NO owner -> operator grant, so operator must see:
--     - its own 5 cars
--     - viewer's fleet (via the editor grant from viewer)
--     - but NEVER owner's fleet
--
-- How to use:
-- 1. Create the 4 auth accounts first (Supabase Studio or the app sign-up
--    flow) with exactly these emails. Profiles are created automatically by
--    the on_auth_user_created trigger - this script never touches auth.users.
--      owner@mycars-demo.ro
--      viewer@mycars-demo.ro
--      editor@mycars-demo.ro
--      operator@mycars-demo.ro
-- 2. Set run_delete_only below (false = normal run, true = cleanup only).
-- 3. Run this whole file in the Supabase SQL editor.
--
-- Safety / idempotency:
-- - The script always looks up the 4 profiles by email and raises an
--   exception (aborting the whole transaction) if any of them is missing.
-- - Cleanup is done first, every time, based on owner_id + a fixed list of
--   license_plate values (one list per account) - never on notes or VIN
--   markers, so notes stay purely descriptive and VINs stay realistic.
-- - Deleting a car cascades (on delete cascade) to car_documents, rentals,
--   maintenance and rental_price_segments (via rentals). The fleet_access
--   rows are deleted separately (exact owner_id + invited_email pairs).
-- - Running with run_delete_only = true removes everything created below
--   and returns without inserting anything.
-- - Running with run_delete_only = false cleans up first, then re-inserts,
--   so the script can be re-run safely as many times as needed.
-- - Nothing outside the 4 demo profiles is ever touched.
--
-- Schema notes respected:
-- - engine_kw is a generated column, never inserted.
-- - cars.status is inserted as 'available' or 'archived' only. 'rented' and
--   'maintenance' are derived by the app from active rentals / blocking
--   maintenance (see src/lib/fleet-report.ts, deriveOperationalCarState),
--   exactly like the local demo mode.
-- - chassis_number values are synthetic but plausible per-brand VINs (17
--   chars, no I/O/Q), never copied from a real vehicle, and never carry a
--   seed marker.
-- - annual_insurance_cost is lei/year (not EUR), per the approved plan.
-- - purchase_price is EUR (purchase_currency = 'EUR').

begin;

do $$
declare
  run_delete_only boolean := false;

  owner_email    text := 'owner@mycars-demo.ro';
  viewer_email   text := 'viewer@mycars-demo.ro';
  editor_email   text := 'editor@mycars-demo.ro';
  operator_email text := 'operator@mycars-demo.ro';

  owner_profile_id    uuid;
  viewer_profile_id   uuid;
  editor_profile_id   uuid;
  operator_profile_id uuid;

  bad_vin_count integer;
  transitive_count integer;

  cars_total integer;
  documents_total integer;
  rentals_total integer;
  segments_total integer;
  maintenance_total integer;
begin
  -------------------------------------------------------------------------
  -- 1. Resolve the 4 profiles. Abort (rolls back the whole transaction)
  --    if any of them does not exist yet.
  -------------------------------------------------------------------------
  select id into owner_profile_id from public.profiles where lower(email) = lower(owner_email) limit 1;
  select id into viewer_profile_id from public.profiles where lower(email) = lower(viewer_email) limit 1;
  select id into editor_profile_id from public.profiles where lower(email) = lower(editor_email) limit 1;
  select id into operator_profile_id from public.profiles where lower(email) = lower(operator_email) limit 1;

  if owner_profile_id is null then
    raise exception 'Nu am gasit profilul pentru %. Creeaza contul in Supabase Auth inainte de a rula seedul.', owner_email;
  end if;

  if viewer_profile_id is null then
    raise exception 'Nu am gasit profilul pentru %. Creeaza contul in Supabase Auth inainte de a rula seedul.', viewer_email;
  end if;

  if editor_profile_id is null then
    raise exception 'Nu am gasit profilul pentru %. Creeaza contul in Supabase Auth inainte de a rula seedul.', editor_email;
  end if;

  if operator_profile_id is null then
    raise exception 'Nu am gasit profilul pentru %. Creeaza contul in Supabase Auth inainte de a rula seedul.', operator_email;
  end if;

  -------------------------------------------------------------------------
  -- 2. Cleanup (always runs first, idempotent). Delete-mode: owner_id +
  --    fixed license_plate list, per account. Cascades handle documents /
  --    rentals / rental_price_segments / maintenance automatically.
  -------------------------------------------------------------------------
  delete from public.fleet_access
  where (owner_id = owner_profile_id and invited_email = viewer_email)
     or (owner_id = owner_profile_id and invited_email = editor_email)
     or (owner_id = viewer_profile_id and invited_email = operator_email);

  delete from public.cars
  where owner_id = owner_profile_id
    and license_plate in (
      'B-201-LGN', 'B-118-SDR', 'AG-45-DST', 'SB-77-MGN', 'CJ-63-OCT', 'IS-29-FAB',
      'PH-52-PST', 'TM-84-GLF', 'CT-16-COR', 'BV-38-I30', 'DB-91-TCS', 'GL-27-CED',
      'MS-59-FCS', 'BH-14-AST', 'B-733-BMW', 'VL-22-CVC', 'BR-08-308', 'BC-46-LEN'
    );

  delete from public.cars
  where owner_id = viewer_profile_id
    and license_plate in ('CJ-11-SDR', 'CJ-52-CLI', 'CJ-77-FAB', 'CJ-34-COR', 'CJ-19-FST');

  delete from public.cars
  where owner_id = editor_profile_id
    and license_plate in ('TM-22-YRS', 'TM-63-I20', 'TM-08-RPD', 'TM-91-LGN', 'TM-45-PLO');

  delete from public.cars
  where owner_id = operator_profile_id
    and license_plate in ('CT-14-LGN', 'CT-58-CLI', 'CT-27-COR', 'CT-73-FST', 'CT-36-I10');

  if run_delete_only then
    raise notice 'Seed demo sters pentru owner/viewer/editor/operator (fleet_access + cele 33 masini si datele lor).';
    return;
  end if;

  -------------------------------------------------------------------------
  -- 3. Staging tables for this run only.
  -------------------------------------------------------------------------
  create temp table seed_car_map (
    license_plate text primary key,
    car_id uuid not null
  ) on commit drop;

  create temp table seed_rental_map (
    renter_cnp text primary key,
    rental_id uuid not null,
    car_id uuid not null
  ) on commit drop;

  -------------------------------------------------------------------------
  -- 4. Cars (18 owner + 5 viewer + 5 editor + 5 operator = 33).
  --    status is 'available' for every non-archived car; 'rented' and
  --    'maintenance' are derived by the app from rentals/maintenance below.
  -------------------------------------------------------------------------
  with inserted_cars as (
    insert into public.cars (
      owner_id, license_plate, brand, model, year, color, engine_hp, engine_displacement,
      transmission, chassis_number, category, status, purchase_price, purchase_currency,
      annual_insurance_cost, notes, current_km, archived_at, created_at, updated_at
    )
    select
      case v.account
        when 'owner' then owner_profile_id
        when 'viewer' then viewer_profile_id
        when 'editor' then editor_profile_id
        else operator_profile_id
      end,
      v.license_plate, v.brand, v.model, v.year, v.color, v.engine_hp, v.engine_displacement,
      v.transmission, v.chassis_number, v.category,
      case when v.archived_offset is null then 'available' else 'archived' end,
      v.purchase_price, 'EUR', v.annual_insurance_cost, v.notes, v.current_km,
      case when v.archived_offset is null then null else (current_date + v.archived_offset)::timestamp end,
      (current_date + v.created_offset)::timestamp,
      now()
    from (values
      -- account, license_plate, brand, model, year, color, engine_hp, engine_displacement, transmission, chassis_number, category, purchase_price, annual_insurance_cost, current_km, notes, created_offset, archived_offset
      ('owner','B-201-LGN','Dacia','Logan',2019,'Alb',90,999,'manual','UU1LSDC5XKL284193','rent',6900,1300,128500,'far stanga fisurat, se aburesc geamurile des',-890,null::int),
      ('owner','B-118-SDR','Dacia','Sandero',2021,'Gri',90,999,'manual','UU1SDCB5FL3412075','bolt',8200,1450,71200,'volan tremura usor peste 100 km/h',-520,null),
      ('owner','AG-45-DST','Dacia','Duster',2020,'Portocaliu',115,1461,'manual','UU1HSDCV6ML556812','personal',12100,1500,54300,'portbagaj nu se inchide corect, geam electric spate blocat',-610,null),
      ('owner','SB-77-MGN','Renault','Megane',2021,'Albastru',115,1461,'manual','VF1RFA1CFN2298341','rent',11800,1750,68900,'zgarietura adanca aripa dreapta spate',-760,null),
      ('owner','CJ-63-OCT','Skoda','Octavia',2020,'Gri',150,1968,'automatic','TMBJJ7NE9MZ209156','rent',15600,2150,112400,'consum mare fata de normal, posibil injectoare',-840,null),
      ('owner','IS-29-FAB','Skoda','Fabia',2022,'Rosu',95,999,'manual','TMBGEJ5AB0X184527','bolt',9700,1600,42800,'amortizoare fata zgomotoase pe denivelari',-380,null),
      ('owner','PH-52-PST','Volkswagen','Passat',2019,'Negru',150,1968,'automatic','WVWZZZ3CZLE471029','service_replacement',13900,3100,158700,'in service pentru distributie, nu e disponibila',-900,null),
      ('owner','TM-84-GLF','Volkswagen','Golf',2021,'Negru',116,1498,'automatic','WVWZZZ1KZAM623847','uber',14300,2250,79600,'senzor parcare spate defect',-560,null),
      ('owner','CT-16-COR','Toyota','Corolla',2020,'Alb perlat',122,1798,'automatic','NMTBZ3BE81T042563','bolt',16800,2400,93100,'jante fata indoite usor, vibratie la viteza',-470,null),
      ('owner','BV-38-I30','Hyundai','i30',2020,'Argintiu',120,1368,'manual','TMAD391AAMZ842137','rent',10600,1650,101300,'climatizare cu miros neplacut la pornire',-680,null),
      ('owner','DB-91-TCS','Hyundai','Tucson',2022,'Negru',150,1598,'automatic','TMAD681BBNX532984','rent',21900,3350,48700,'cauciucuri de iarna montate, uzura avansata',-240,null),
      ('owner','GL-27-CED','Kia','Ceed',2022,'Rosu',140,1353,'automatic','U5YFF24219L847362','bolt',16200,2200,39500,'zgarieturi multiple pe bara spate',-300,null),
      ('owner','MS-59-FCS','Ford','Focus',2019,'Alb',125,998,'manual','WF0AXXWPMBF529314','rent',8600,1550,134200,'ambreiaj tine sus, posibil de schimbat curand',-910,null),
      ('owner','BH-14-AST','Opel','Astra',2020,'Alb',110,1496,'manual','W0LPF6EDX9AH73824','rent',9900,1600,108900,'baterie slaba, pornire dificila dimineata',-720,null),
      ('owner','B-733-BMW','BMW','Seria 3',2019,'Albastru inchis',190,1995,'automatic','WBA8E9C51HL739246','general',23800,3950,121600,'scaun sofer uzat, tapiterie decolorata',-850,null),
      ('owner','VL-22-CVC','Honda','Civic',2020,'Alb',182,1498,'manual','SHHFK2841HV682359','uber',17400,2350,86300,'zgomot suspensie fata la viraje',-430,null),
      ('owner','BR-08-308','Peugeot','308',2017,'Gri inchis',130,1499,'automatic','VF3CBHZAP2Z619384','personal',11600,1800,149800,'vanduta, kilometraj mare si reparatii dese',-1400,-270),
      ('owner','BC-46-LEN','Seat','Leon',2018,'Alb',150,1498,'manual','VSSZZZ4HZFS618273','general',12900,1850,162300,'scoasa din flota, cutie de viteze cu probleme',-1250,-55),

      ('viewer','CJ-11-SDR','Dacia','Sandero',2020,'Alb',90,999,'manual','UU1SDCA3EL2984716','personal',7600,1350,61200,'far dreapta condensat',-310,null),
      ('viewer','CJ-52-CLI','Renault','Clio',2019,'Gri',90,1461,'manual','VF1CPB1FL28419375','rent',7100,1300,88400,'bara fata zgariata usor',-480,null),
      ('viewer','CJ-77-FAB','Skoda','Fabia',2018,'Albastru',90,999,'manual','TMBGEJ4AH2X371956','rent',6800,1550,97600,'geam spate stanga merge greu',-560,null),
      ('viewer','CJ-34-COR','Opel','Corsa',2019,'Alb',90,1398,'manual','W0LPF5FDX8AG42163','personal',6400,1300,72300,'oglinda stanga crapata',-390,null),
      ('viewer','CJ-19-FST','Ford','Fiesta',2018,'Rosu',100,1499,'manual','WF0AXXWTKAG583172','general',6200,1350,104900,'in service pentru cauciucuri si frane',-430,null),

      ('editor','TM-22-YRS','Toyota','Yaris',2021,'Alb',100,1490,'automatic','NMTBZ1BE72T841563','bolt',12400,1650,47800,'aer conditionat porneste greu',-350,null),
      ('editor','TM-63-I20','Hyundai','i20',2020,'Argintiu',100,1248,'manual','TMAD451BCPY628347','uber',9800,1600,68200,'zgarietura usa sofer',-410,null),
      ('editor','TM-08-RPD','Skoda','Rapid',2019,'Gri',90,999,'manual','TMBNJ2AE63Z481952','rent',6900,1550,92100,'consola centrala zgariata',-520,null),
      ('editor','TM-91-LGN','Dacia','Logan',2018,'Alb',90,999,'manual','UU1LSDB4FK1738296','rent',6300,1250,118700,'far ceata stanga nefunctional',-600,null),
      ('editor','TM-45-PLO','Volkswagen','Polo',2020,'Negru',95,999,'manual','WVWZZZ6RZAW295184','personal',10200,1550,56400,'covorase lipsa, interior uzat',-280,null),

      ('operator','CT-14-LGN','Dacia','Logan',2017,'Alb',75,1198,'manual','UU1LSDA2EH9361728','rent',5600,1200,156800,'bara spate desprinsa partial',-640,null),
      ('operator','CT-58-CLI','Renault','Clio',2018,'Gri',90,1461,'manual','VF1CPB2GM38416579','bolt',6700,1300,89300,'scaun spate pata neagra',-470,null),
      ('operator','CT-27-COR','Opel','Corsa',2017,'Alb',90,1398,'manual','W0LPF4FDT7AH52963','rent',5900,1250,138200,'cauciuc fata dreapta uzat',-380,null),
      ('operator','CT-73-FST','Ford','Fiesta',2019,'Albastru',100,1499,'manual','WF0AXXWTLBH471938','uber',7300,1450,76500,'in service pentru placute frana',-330,null),
      ('operator','CT-36-I10','Hyundai','i10',2019,'Rosu',67,998,'manual','TMAD271DDNZ843617','personal',6100,1200,53700,'geam electric fata dreapta lent',-290,null)
    ) as v(
      account, license_plate, brand, model, year, color, engine_hp, engine_displacement, transmission,
      chassis_number, category, purchase_price, annual_insurance_cost, current_km, notes, created_offset, archived_offset
    )
    returning id, license_plate
  )
  insert into seed_car_map (car_id, license_plate)
  select id, license_plate from inserted_cars;

  -- Safety check #1: every VIN must be exactly 17 chars and match the
  -- project's chassis_number format (no I, O or Q).
  select count(*) into bad_vin_count
  from public.cars c
  join seed_car_map m on m.car_id = c.id
  where length(c.chassis_number) <> 17
     or c.chassis_number !~ '^[A-HJ-NPR-Z0-9]{17}$';

  if bad_vin_count > 0 then
    raise exception 'Seed: % sasiu(uri) nu respecta formatul de 17 caractere fara I/O/Q. Corecteaza scriptul.', bad_vin_count;
  end if;

  -------------------------------------------------------------------------
  -- 5. Mandatory documents (RCA + ITP) for every car. issue_date is set to
  --    one year before expiry_date. Offsets were chosen to produce expired,
  --    0-7d, 8-14d, 15-30d and further-out documents (matches the plan).
  -------------------------------------------------------------------------
  insert into public.car_documents (car_id, type, custom_name, issue_date, expiry_date, is_mandatory, created_at)
  select
    m.car_id, d.doc_type,
    case d.doc_type when 'RCA' then 'RCA anual' else 'Inspectie tehnica periodica' end,
    ((current_date + d.expiry_offset) - interval '1 year')::date,
    (current_date + d.expiry_offset),
    true,
    now()
  from (values
    -- license_plate, doc_type, expiry_offset
    ('B-201-LGN','RCA',145), ('B-201-LGN','ITP',60),
    ('B-118-SDR','RCA',210), ('B-118-SDR','ITP',95),
    ('AG-45-DST','RCA',180), ('AG-45-DST','ITP',40),
    ('SB-77-MGN','RCA',5),   ('SB-77-MGN','ITP',75),
    ('CJ-63-OCT','RCA',12),  ('CJ-63-OCT','ITP',150),
    ('IS-29-FAB','RCA',90),  ('IS-29-FAB','ITP',20),
    ('PH-52-PST','RCA',-18), ('PH-52-PST','ITP',200),
    ('TM-84-GLF','RCA',260), ('TM-84-GLF','ITP',110),
    ('CT-16-COR','RCA',300), ('CT-16-COR','ITP',9),
    ('BV-38-I30','RCA',170), ('BV-38-I30','ITP',230),
    ('DB-91-TCS','RCA',330), ('DB-91-TCS','ITP',55),
    ('GL-27-CED','RCA',25),  ('GL-27-CED','ITP',190),
    ('MS-59-FCS','RCA',80),  ('MS-59-FCS','ITP',-30),
    ('BH-14-AST','RCA',130), ('BH-14-AST','ITP',14),
    ('B-733-BMW','RCA',280), ('B-733-BMW','ITP',100),
    ('VL-22-CVC','RCA',160), ('VL-22-CVC','ITP',240),
    ('BR-08-308','RCA',-220),('BR-08-308','ITP',-210),
    ('BC-46-LEN','RCA',-60), ('BC-46-LEN','ITP',-70),

    ('CJ-11-SDR','RCA',200), ('CJ-11-SDR','ITP',90),
    ('CJ-52-CLI','RCA',150), ('CJ-52-CLI','ITP',60),
    ('CJ-77-FAB','RCA',8),   ('CJ-77-FAB','ITP',180),
    ('CJ-34-COR','RCA',170), ('CJ-34-COR','ITP',45),
    ('CJ-19-FST','RCA',-25), ('CJ-19-FST','ITP',220),

    ('TM-22-YRS','RCA',190), ('TM-22-YRS','ITP',70),
    ('TM-63-I20','RCA',160), ('TM-63-I20','ITP',50),
    ('TM-08-RPD','RCA',6),   ('TM-08-RPD','ITP',140),
    ('TM-91-LGN','RCA',100), ('TM-91-LGN','ITP',-15),
    ('TM-45-PLO','RCA',210), ('TM-45-PLO','ITP',95),

    ('CT-14-LGN','RCA',140), ('CT-14-LGN','ITP',55),
    ('CT-58-CLI','RCA',170), ('CT-58-CLI','ITP',80),
    ('CT-27-COR','RCA',90),  ('CT-27-COR','ITP',12),
    ('CT-73-FST','RCA',-20), ('CT-73-FST','ITP',160),
    ('CT-36-I10','RCA',200), ('CT-36-I10','ITP',75)
  ) as d(license_plate, doc_type, expiry_offset)
  join seed_car_map m on m.license_plate = d.license_plate;

  -------------------------------------------------------------------------
  -- 6. Extra documents (CASCO / ROVINIETA / TALON / CI_VEHICUL / OTHER).
  -------------------------------------------------------------------------
  insert into public.car_documents (car_id, type, custom_name, issue_date, expiry_date, is_mandatory, created_at)
  select
    m.car_id, e.doc_type, e.custom_name,
    case when e.issue_offset is null then null else (current_date + e.issue_offset) end,
    case when e.expiry_offset is null then null else (current_date + e.expiry_offset) end,
    false,
    now()
  from (values
    -- license_plate, doc_type, custom_name, issue_offset, expiry_offset
    ('CJ-63-OCT','CASCO','CASCO Full',-200,165),
    ('DB-91-TCS','CASCO','CASCO Full',-100,265),
    ('B-733-BMW','CASCO','CASCO Full',-300,65),
    ('B-733-BMW','OTHER','Contract de leasing',null::int,null::int),
    ('B-118-SDR','ROVINIETA','Rovinieta',-20,10),
    ('GL-27-CED','ROVINIETA','Rovinieta',-40,-10),
    ('TM-84-GLF','TALON','Talon inmatriculare',null,null),
    ('CT-16-COR','CI_VEHICUL','Carte identitate vehicul',null,null),
    ('PH-52-PST','CASCO','CASCO Full',-280,85),
    ('VL-22-CVC','ROVINIETA','Rovinieta',-5,25),
    ('SB-77-MGN','CI_VEHICUL','Carte identitate vehicul',null,null),
    ('MS-59-FCS','OTHER','Amenda neachitata',-15,null),
    ('AG-45-DST','ROVINIETA','Rovinieta',-8,22),
    ('BC-46-LEN','OTHER','Adeverinta radiere provizorie',-50,-45),

    ('CJ-52-CLI','ROVINIETA','Rovinieta',-10,20),
    ('CJ-11-SDR','CASCO','CASCO Full',-150,215),

    ('TM-22-YRS','CASCO','CASCO Full',-180,185),
    ('TM-45-PLO','TALON','Talon inmatriculare',null,null),

    ('CT-14-LGN','ROVINIETA','Rovinieta',-25,5),
    ('CT-36-I10','CI_VEHICUL','Carte identitate vehicul',null,null)
  ) as e(license_plate, doc_type, custom_name, issue_offset, expiry_offset)
  join seed_car_map m on m.license_plate = e.license_plate;

  -------------------------------------------------------------------------
  -- 7. Rentals. Notes describe the car's state BEFORE handover (defects
  --    only, no diacritics, nothing positive). renter_cnp values are
  --    synthetic 13-digit strings (format-only, not real CNP checksums).
  --    Dates are offsets from current_date so the seed keeps working
  --    whenever it is actually run; with "today" in mid-2026 they land
  --    across 2024/2025/2026 as intended.
  -------------------------------------------------------------------------
  create temp table seed_rentals_raw (
    renter_cnp text primary key,
    license_plate text not null,
    renter_name text not null,
    renter_surname text not null,
    start_offset integer not null,
    end_offset integer not null,
    status text not null,
    advance_payment numeric not null,
    notes text not null,
    km_start integer,
    km_end integer,
    price_per_unit numeric not null,
    price_unit text not null
  ) on commit drop;

  insert into seed_rentals_raw (renter_cnp, license_plate, renter_name, renter_surname, start_offset, end_offset, status, advance_payment, notes, km_start, km_end, price_per_unit, price_unit) values
    -- ===== OWNER (38 rentals: 3 active, 2 cancelled, 33 completed) =====
    ('1000000000001','B-201-LGN','Andrei','Popescu',-650,-636,'completed',450,'cauciuc de rezerva lipsa',125000,125650,145,'day'),
    ('1000000000002','B-201-LGN','Mihai','Ionescu',-95,-85,'completed',400,'far ceata dreapta abureste',127800,128300,155,'day'),

    ('1000000000003','B-118-SDR','Ioana','Dumitrescu',-580,-560,'completed',900,'zgarietura portiera stanga spate',60000,61050,150,'day'),
    ('1000000000004','B-118-SDR','Alexandru','Stan',-250,-230,'completed',1000,'geam electric spate lent',66000,67100,165,'day'),
    ('1000000000005','B-118-SDR','Cristina','Marin',-40,-25,'completed',700,'oglinda dreapta zgariata',70500,71200,175,'day'),

    ('1000000000006','SB-77-MGN','Radu','Georgescu',-500,-478,'completed',1450,'zgarietura adanca aripa fata',65000,66200,190,'week'),
    ('1000000000007','SB-77-MGN','Elena','Ilie',-6,9,'active',900,'zgarietura adanca aripa dreapta spate',68900,null,210,'day'),

    ('1000000000008','CJ-63-OCT','Vlad','Tudor',-820,-790,'completed',2600,'consum mare, posibil injectoare',100000,102400,900,'week'),
    ('1000000000009','CJ-63-OCT','Diana','Nistor',-150,-135,'completed',900,'zgomot suspensie spate',109000,110100,230,'day'),

    ('1000000000010','IS-29-FAB','Sorin','Balan',-300,-286,'completed',600,'amortizoare zgomotoase pe denivelari',38000,38700,160,'day'),
    ('1000000000011','IS-29-FAB','Gabriela','Enache',-4,6,'active',400,'far stanga condensat',42800,null,170,'day'),

    ('1000000000012','PH-52-PST','Florin','Barbu',-700,-670,'completed',1900,'consum mare motorina, fum la accelerare',150000,152800,1900,'month'),

    ('1000000000013','TM-84-GLF','Ramona','Dragomir',-430,-410,'completed',1300,'senzor parcare spate defect',74000,75100,240,'day'),
    ('1000000000014','TM-84-GLF','Bogdan','Constantin',-70,-60,'cancelled',0,'rezervare anulata, client nu s-a prezentat',null,null,255,'day'),

    ('1000000000015','CT-16-COR','Simona','Voicu',-560,-540,'completed',1250,'jante fata usor indoite',86000,87100,230,'day'),
    ('1000000000016','CT-16-COR','Catalin','Neagu',-280,-260,'completed',1300,'vibratie usoara la viteza mare',90000,91200,245,'day'),
    ('1000000000017','CT-16-COR','Andrei','Popescu',-60,-45,'completed',1000,'cauciuc fata dreapta uzat',92500,93100,260,'day'),

    ('1000000000018','BV-38-I30','Mihai','Ionescu',-610,-590,'completed',900,'climatizare cu miros la pornire',94000,95300,165,'day'),
    ('1000000000019','BV-38-I30','Ioana','Dumitrescu',-160,-145,'completed',700,'geam spate stanga greu',99800,100700,175,'day'),

    ('1000000000020','DB-91-TCS','Alexandru','Stan',-220,-195,'completed',2200,'cauciucuri iarna montate, uzura avansata',44000,46800,305,'day'),
    ('1000000000021','DB-91-TCS','Cristina','Marin',-60,-40,'completed',1900,'senzor presiune anvelope eronat',47200,48200,335,'day'),
    ('1000000000022','DB-91-TCS','Radu','Georgescu',-8,22,'active',2500,'cauciucuri de iarna montate, uzura avansata',48700,null,345,'day'),

    ('1000000000023','GL-27-CED','Elena','Ilie',-540,-520,'completed',1400,'zgarieturi bara spate',32000,33100,210,'day'),
    ('1000000000024','GL-27-CED','Vlad','Tudor',-220,-205,'completed',1050,'far dreapta condensat',36000,36700,240,'day'),
    ('1000000000025','GL-27-CED','Diana','Nistor',-35,-22,'completed',950,'jante zgariate fata',38900,39500,255,'day'),

    ('1000000000026','MS-59-FCS','Sorin','Balan',-770,-750,'completed',900,'ambreiaj tine sus',128000,129200,150,'day'),
    ('1000000000027','MS-59-FCS','Gabriela','Enache',-180,-170,'completed',450,'zgomot motor la ralanti',132500,133100,160,'day'),

    ('1000000000028','BH-14-AST','Florin','Barbu',-500,-485,'completed',600,'baterie slaba, pornire dificila',102000,102900,145,'day'),
    ('1000000000029','BH-14-AST','Ramona','Dragomir',-18,-10,'cancelled',0,'rezervare anulata de client inainte de predare',null,null,150,'day'),

    ('1000000000030','B-733-BMW','Bogdan','Constantin',-830,-800,'completed',6200,'scaun sofer uzat',115000,118200,1800,'week'),
    ('1000000000031','B-733-BMW','Simona','Voicu',-300,-280,'completed',2600,'tapiterie decolorata pe bord',119500,121300,370,'day'),
    ('1000000000032','B-733-BMW','Catalin','Neagu',-50,-35,'completed',1900,'zgomot suspensie fata la viraje',121600,122900,380,'day'),

    ('1000000000033','VL-22-CVC','Andrei','Popescu',-390,-370,'completed',1750,'zgomot suspensie fata la denivelari',82000,83400,260,'day'),
    ('1000000000034','VL-22-CVC','Mihai','Ionescu',-75,-60,'completed',1350,'ambreiaj usor dur',85700,86300,270,'day'),

    ('1000000000035','BR-08-308','Ioana','Dumitrescu',-900,-880,'completed',1200,'kilometraj mare, suspensie zgomotoasa',140000,141200,180,'day'),
    ('1000000000036','BR-08-308','Alexandru','Stan',-400,-385,'completed',900,'reparatii frecvente, consum mare',148000,149000,185,'day'),

    ('1000000000037','BC-46-LEN','Cristina','Marin',-850,-830,'completed',1300,'cutie de viteze trece greu',155000,156300,190,'day'),
    ('1000000000038','BC-46-LEN','Radu','Georgescu',-200,-180,'completed',1350,'zgomot cutie de viteze',160500,161900,195,'day'),

    -- ===== VIEWER (10 rentals: 1 active, 1 cancelled, 8 completed) =====
    ('1000000000039','CJ-52-CLI','Elena','Ilie',-520,-505,'completed',550,'bara fata zgariata usor',80000,80900,120,'day'),
    ('1000000000040','CJ-52-CLI','Vlad','Tudor',-250,-238,'completed',450,'geam electric fata lent',84500,85200,130,'day'),
    ('1000000000041','CJ-52-CLI','Diana','Nistor',-60,-50,'completed',400,'oglinda stanga crapata',87800,88400,135,'day'),
    ('1000000000042','CJ-52-CLI','Sorin','Balan',-15,-8,'cancelled',0,'rezervare anulata inainte de predare',null,null,125,'day'),

    ('1000000000043','CJ-77-FAB','Gabriela','Enache',-400,-385,'completed',500,'geam spate stanga greu',91000,91900,115,'day'),
    ('1000000000044','CJ-77-FAB','Florin','Barbu',-100,-88,'completed',400,'far dreapta condensat',95500,96300,120,'day'),
    ('1000000000045','CJ-77-FAB','Ramona','Dragomir',-5,8,'active',350,'geam spate stanga merge greu',97600,null,125,'day'),

    ('1000000000046','CJ-34-COR','Bogdan','Constantin',-350,-338,'completed',380,'oglinda stanga crapata',65000,65700,110,'day'),
    ('1000000000047','CJ-34-COR','Simona','Voicu',-90,-80,'completed',330,'far dreapta condensat',70500,71100,115,'day'),

    ('1000000000048','CJ-19-FST','Catalin','Neagu',-420,-408,'completed',350,'geam electric fata greu',98000,98700,108,'day'),

    -- ===== EDITOR (9 rentals: 1 active, 1 cancelled, 7 completed) =====
    ('1000000000049','TM-22-YRS','Andrei','Popescu',-300,-288,'completed',430,'aer conditionat porneste greu',40000,40800,130,'day'),
    ('1000000000050','TM-22-YRS','Mihai','Ionescu',-80,-70,'completed',400,'zgarietura bara fata',45500,46100,140,'day'),

    ('1000000000051','TM-63-I20','Ioana','Dumitrescu',-350,-338,'completed',400,'zgarietura usa sofer',60000,60750,125,'day'),
    ('1000000000052','TM-63-I20','Alexandru','Stan',-95,-85,'completed',380,'geam electric spate lent',65500,66100,135,'day'),

    ('1000000000053','TM-08-RPD','Cristina','Marin',-450,-435,'completed',480,'consola centrala zgariata',82000,83000,115,'day'),
    ('1000000000054','TM-08-RPD','Radu','Georgescu',-3,10,'active',350,'consola centrala zgariata',92100,null,120,'day'),

    ('1000000000055','TM-91-LGN','Elena','Ilie',-520,-505,'completed',400,'far ceata stanga nefunctional',108000,108900,105,'day'),
    ('1000000000056','TM-91-LGN','Vlad','Tudor',-180,-168,'completed',350,'zgarietura bara spate',113500,114200,110,'day'),
    ('1000000000057','TM-91-LGN','Diana','Nistor',-20,-14,'cancelled',0,'rezervare anulata de client',null,null,108,'day'),

    -- ===== OPERATOR (8 rentals: 1 active, 1 cancelled, 6 completed) =====
    ('1000000000058','CT-14-LGN','Sorin','Balan',-480,-465,'completed',350,'bara spate desprinsa partial',145000,145850,95,'day'),
    ('1000000000059','CT-14-LGN','Gabriela','Enache',-140,-128,'completed',300,'far stanga fisurat',152000,152700,100,'day'),

    ('1000000000060','CT-58-CLI','Florin','Barbu',-400,-388,'completed',320,'scaun spate pata neagra',78000,78650,105,'day'),
    ('1000000000061','CT-58-CLI','Ramona','Dragomir',-90,-80,'completed',280,'zgarietura usa dreapta',85500,86100,110,'day'),

    ('1000000000062','CT-27-COR','Bogdan','Constantin',-300,-285,'completed',350,'cauciuc fata dreapta uzat',128000,129100,90,'day'),
    ('1000000000063','CT-27-COR','Simona','Voicu',-6,9,'active',250,'cauciuc fata dreapta uzat',138200,null,95,'day'),

    ('1000000000064','CT-73-FST','Catalin','Neagu',-250,-238,'completed',300,'geam electric fata dreapta lent',70000,70650,100,'day'),
    ('1000000000065','CT-73-FST','Andrei','Popescu',-25,-18,'cancelled',0,'rezervare anulata inainte de predare',null,null,102,'day');

  with inserted_rentals as (
    insert into public.rentals (
      car_id, renter_name, renter_surname, renter_cnp, start_date, end_date,
      advance_payment, status, notes, km_start, km_end, created_at, updated_at
    )
    select
      m.car_id, r.renter_name, r.renter_surname, r.renter_cnp,
      (current_date + r.start_offset), (current_date + r.end_offset),
      r.advance_payment, r.status, r.notes, r.km_start, r.km_end,
      (current_date + r.start_offset)::timestamp,
      (current_date + r.end_offset)::timestamp
    from seed_rentals_raw r
    join seed_car_map m on m.license_plate = r.license_plate
    returning id, car_id, renter_cnp
  )
  insert into seed_rental_map (rental_id, car_id, renter_cnp)
  select id, car_id, renter_cnp from inserted_rentals;

  -------------------------------------------------------------------------
  -- 8. Price segments: one default segment per rental (full range, the
  --    rate carried on seed_rentals_raw), then 6 flagship rentals get their
  --    default segment replaced by 2 segments (rate changes partway),
  --    mirroring the local demo's multi-segment rentals.
  -------------------------------------------------------------------------
  insert into public.rental_price_segments (rental_id, price_per_unit, price_unit, start_date, end_date, created_at)
  select rm.rental_id, r.price_per_unit, r.price_unit,
    (current_date + r.start_offset), (current_date + r.end_offset),
    (current_date + r.start_offset)::timestamp
  from seed_rentals_raw r
  join seed_rental_map rm on rm.renter_cnp = r.renter_cnp;

  delete from public.rental_price_segments
  where rental_id in (
    select rental_id from seed_rental_map
    where renter_cnp in ('1000000000006','1000000000008','1000000000012','1000000000020','1000000000023','1000000000030')
  );

  insert into public.rental_price_segments (rental_id, price_per_unit, price_unit, start_date, end_date, created_at)
  select rm.rental_id, s.price_per_unit, s.price_unit,
    (current_date + s.seg_start_offset), (current_date + s.seg_end_offset),
    (current_date + s.seg_start_offset)::timestamp
  from (values
    -- renter_cnp, price_per_unit, price_unit, seg_start_offset, seg_end_offset
    ('1000000000006',190,'day',-500,-490),
    ('1000000000006',215,'day',-489,-478),
    ('1000000000008',900,'week',-820,-806),
    ('1000000000008',1000,'week',-805,-790),
    ('1000000000012',1750,'week',-700,-686),
    ('1000000000012',1900,'week',-685,-670),
    ('1000000000020',305,'day',-220,-208),
    ('1000000000020',335,'day',-207,-195),
    ('1000000000023',210,'day',-540,-530),
    ('1000000000023',235,'day',-529,-520),
    ('1000000000030',1800,'week',-830,-816),
    ('1000000000030',2000,'week',-815,-800)
  ) as s(renter_cnp, price_per_unit, price_unit, seg_start_offset, seg_end_offset)
  join seed_rental_map rm on rm.renter_cnp = s.renter_cnp;

  -------------------------------------------------------------------------
  -- 9. Maintenance. notes list parts + labor on separate lines; the sum of
  --    those lines always equals cost. blocks_availability = true is used
  --    for the 3 "in service right now" cars plus 3 historical big repairs
  --    (spaced so they never overlap a non-cancelled rental of that car).
  -------------------------------------------------------------------------
  insert into public.maintenance (car_id, type, description, cost, date_performed, service_end_date, blocks_availability, km_at_service, notes, created_at)
  select
    m.car_id, x.mtype, x.description, x.cost,
    (current_date + x.start_offset), (current_date + x.end_offset),
    x.blocks_availability, x.km_at_service, x.notes,
    (current_date + x.start_offset)::timestamp
  from (values
    -- license_plate, mtype, description, cost, start_offset, end_offset, blocks_availability, km_at_service, notes
    ('B-201-LGN','repair','Placute si discuri frana fata',780,-670,-668,false,128000,
      E'Placute frana ATE - 220 lei\nDiscuri frana fata - 420 lei\nManopera - 140 lei'),
    ('B-201-LGN','other','Revizie ulei si filtre',420,-300,-299,false,130500,
      E'Ulei motor 4L - 180 lei\nFiltru ulei - 40 lei\nFiltru aer - 60 lei\nManopera - 140 lei'),

    ('B-118-SDR','investment','Anvelope noi vara set 4',1380,-600,-598,false,58000,
      E'Anvelope Kumho set 4 - 1080 lei\nMontaj si echilibrare - 220 lei\nValve - 40 lei\nManopera - 40 lei'),
    ('B-118-SDR','repair','Inlocuire baterie',480,-270,-269,false,65500,
      E'Baterie Rombat - 380 lei\nManopera - 100 lei'),

    ('SB-77-MGN','repair','Distributie completa',1950,-515,-508,true,64200,
      E'Kit distributie Gates - 850 lei\nPompa apa - 260 lei\nCurea accesorii - 130 lei\nAntigel - 110 lei\nManopera - 600 lei'),

    ('CJ-63-OCT','repair','Curatare DPF si EGR',1900,-780,-777,false,103000,
      E'Diagnoza - 100 lei\nCuratare EGR - 350 lei\nCuratare DPF - 700 lei\nSolutie curatare admisie - 150 lei\nManopera - 600 lei'),

    ('IS-29-FAB','repair','Amortizoare fata schimbate',1100,-280,-278,false,39500,
      E'Amortizoare fata set 2 - 700 lei\nRulmenti tampon - 160 lei\nManopera - 240 lei'),

    ('PH-52-PST','repair','Distributie si pompa apa',1850,-3,5,true,158700,
      E'Kit distributie Gates - 780 lei\nPompa apa - 240 lei\nCurea accesorii - 110 lei\nAntigel - 90 lei\nManopera - 630 lei'),
    ('PH-52-PST','repair','Reparatie turbina',2400,-660,-655,true,157200,
      E'Turbina reconditionata - 1650 lei\nSet garnituri - 250 lei\nUlei si filtru - 200 lei\nManopera - 300 lei'),

    ('TM-84-GLF','repair','Senzor parcare si placute frana',950,-350,-348,false,76500,
      E'Senzor parcare spate - 320 lei\nPlacute frana spate - 280 lei\nManopera - 350 lei'),

    ('CT-16-COR','investment','Anvelope noi vara set 4',1550,-450,-448,false,88000,
      E'Anvelope Bridgestone set 4 - 1240 lei\nMontaj si echilibrare - 240 lei\nValve - 40 lei\nManopera - 30 lei'),
    ('CT-16-COR','repair','Geometrie si jante indreptate',620,-40,-38,false,93000,
      E'Geometrie fata - 250 lei\nJanta indreptata - 220 lei\nManopera - 150 lei'),

    ('BV-38-I30','repair','Climatizare incarcare freon si filtru',480,-585,-583,false,94500,
      E'Incarcare freon - 220 lei\nFiltru habitaclu carbon - 120 lei\nManopera - 140 lei'),
    ('BV-38-I30','other','Revizie ulei si filtre',450,-140,-139,false,100900,
      E'Ulei Motul 5W30 4L - 210 lei\nFiltru ulei - 40 lei\nFiltru aer - 60 lei\nManopera - 140 lei'),

    ('DB-91-TCS','investment','Anvelope iarna set 4',2100,-230,-228,false,43500,
      E'Anvelope Continental iarna set 4 - 1700 lei\nMontaj si echilibrare - 260 lei\nValve - 40 lei\nManopera - 100 lei'),

    ('GL-27-CED','repair','Senzor presiune anvelope si placute frana',890,-515,-513,false,33800,
      E'Senzori presiune anvelope set - 380 lei\nPlacute frana fata - 240 lei\nManopera - 270 lei'),

    ('MS-59-FCS','repair','Inlocuire ambreiaj si volanta bimasa',2350,-745,-740,true,129500,
      E'Kit ambreiaj Sachs - 1500 lei\nVolanta bimasa - 600 lei\nUlei cutie - 150 lei\nManopera - 100 lei'),
    ('MS-59-FCS','repair','Placute si discuri frana',850,-160,-158,false,133800,
      E'Placute frana fata - 240 lei\nDiscuri frana fata - 460 lei\nManopera - 150 lei'),

    ('BH-14-AST','repair','Inlocuire baterie si diagnoza',700,-480,-478,false,103200,
      E'Diagnoza - 100 lei\nBaterie Bosch - 480 lei\nManopera - 120 lei'),

    ('B-733-BMW','repair','Placute si discuri frana fata/spate',1650,-790,-785,false,118600,
      E'Placute fata ATE - 320 lei\nDiscuri fata ATE - 520 lei\nPlacute spate - 260 lei\nDiscuri spate - 380 lei\nManopera - 170 lei'),
    ('B-733-BMW','investment','Anvelope noi vara set 4 premium',2400,-270,-268,false,120800,
      E'Anvelope Michelin Pilot Sport set 4 - 2000 lei\nMontaj si echilibrare - 300 lei\nValve - 40 lei\nManopera - 60 lei'),

    ('VL-22-CVC','repair','Revizie ulei, filtre si placute frana',980,-360,-358,false,84000,
      E'Ulei Motul 5W30 4L - 220 lei\nFiltru ulei - 35 lei\nFiltru aer - 55 lei\nPlacute frana fata - 260 lei\nManopera - 410 lei'),

    ('BR-08-308','repair','Cutie viteze si ambreiaj verificate, reparatii minore',1300,-420,-415,false,146500,
      E'Verificare cutie viteze - 300 lei\nAmbreiaj ajustat - 600 lei\nManopera - 400 lei'),

    ('BC-46-LEN','repair','Cutie de viteze cu probleme, reparatie partiala',1750,-150,-145,false,161000,
      E'Diagnoza cutie viteze - 150 lei\nSincronizator treapta 2 - 700 lei\nUlei cutie - 300 lei\nManopera - 600 lei'),

    ('CJ-11-SDR','other','Revizie ulei si filtre',380,-280,-279,false,59000,
      E'Ulei 4L - 180 lei\nFiltru ulei - 35 lei\nManopera - 165 lei'),
    ('CJ-52-CLI','repair','Placute frana fata',420,-230,-228,false,83000,
      E'Placute frana ATE - 260 lei\nManopera - 160 lei'),
    ('CJ-77-FAB','repair','Amortizoare spate zgomotoase, schimbate',950,-370,-368,false,92500,
      E'Amortizoare spate set 2 - 650 lei\nManopera - 300 lei'),
    ('CJ-34-COR','repair','Oglinda retrovizoare inlocuita',340,-330,-329,false,65900,
      E'Oglinda stanga completa - 260 lei\nManopera - 80 lei'),
    ('CJ-19-FST','repair','Cauciucuri si placute frana',980,-2,6,true,104900,
      E'Anvelope Barum 2 buc - 480 lei\nPlacute frana fata - 190 lei\nManopera montaj - 150 lei\nEchilibrare roti - 60 lei\nLichid frana - 100 lei'),
    ('CJ-19-FST','other','Revizie generala',520,-400,-398,false,97500,
      E'Ulei si filtre - 280 lei\nVerificare frane - 90 lei\nManopera - 150 lei'),

    ('TM-22-YRS','repair','Aer conditionat incarcare freon',380,-260,-258,false,46500,
      E'Incarcare freon - 240 lei\nManopera - 140 lei'),
    ('TM-63-I20','other','Zgarietura usa reparata tinichigerie',650,-300,-297,false,62500,
      E'Vopsit usa sofer - 420 lei\nMateriale - 130 lei\nManopera - 100 lei'),
    ('TM-08-RPD','repair','Placute frana si revizie',590,-420,-418,false,83500,
      E'Placute frana fata - 260 lei\nUlei si filtru - 190 lei\nManopera - 140 lei'),
    ('TM-91-LGN','repair','Far ceata stanga inlocuit',320,-490,-488,false,109500,
      E'Far ceata stanga - 230 lei\nManopera - 90 lei'),
    ('TM-91-LGN','other','Revizie ulei si filtre',400,-150,-149,false,114800,
      E'Ulei 4L - 190 lei\nFiltru ulei - 35 lei\nManopera - 175 lei'),

    ('CT-14-LGN','repair','Bara spate fixata partial',380,-460,-458,false,146200,
      E'Reparatie suport bara - 260 lei\nManopera - 120 lei'),
    ('CT-58-CLI','repair','Scaun spate curatat si tapiterie',300,-380,-378,false,78900,
      E'Curatare tapiterie - 180 lei\nManopera - 120 lei'),
    ('CT-27-COR','investment','Anvelope noi vara set 4 economice',1180,-280,-278,false,129500,
      E'Anvelope Sava set 4 - 980 lei\nMontaj si echilibrare - 160 lei\nValve - 40 lei'),
    ('CT-73-FST','repair','Placute frana fata',640,-1,6,true,76500,
      E'Placute frana ATE - 220 lei\nDiscuri frana fata - 340 lei\nManopera - 80 lei'),
    ('CT-36-I10','other','Revizie ulei si filtre',350,-200,-199,false,52000,
      E'Ulei 4L - 170 lei\nFiltru ulei - 30 lei\nManopera - 150 lei')
  ) as x(license_plate, mtype, description, cost, start_offset, end_offset, blocks_availability, km_at_service, notes)
  join seed_car_map m on m.license_plate = x.license_plate;

  -------------------------------------------------------------------------
  -- 10. Fleet access. Exactly 3 rows. NO owner -> operator row exists,
  --     which is what makes the access non-transitive: operator only ever
  --     matches fleet_access.owner_id = viewer_profile_id, never
  --     owner_profile_id (see public.user_has_owner_access, single-hop,
  --     no recursion).
  -------------------------------------------------------------------------
  insert into public.fleet_access (owner_id, invited_email, role, accepted_at, accepted_user_id, created_at)
  values
    (owner_profile_id, viewer_email, 'viewer', now(), viewer_profile_id, now()),
    (owner_profile_id, editor_email, 'editor', now(), editor_profile_id, now()),
    (viewer_profile_id, operator_email, 'editor', now(), operator_profile_id, now());

  -- Safety check #2: there must be no direct owner -> operator grant.
  select count(*) into transitive_count
  from public.fleet_access
  where owner_id = owner_profile_id and invited_email = operator_email;

  if transitive_count > 0 then
    raise exception 'Seed: exista un acces direct owner -> operator, ceea ce ar strica testul de non-tranzitivitate.';
  end if;

  -- rental_price_segments (interval inclus in inchiriere, fara overlap),
  -- km_end >= km_start si end_date >= start_date sunt validate direct de
  -- trigger-ele existente (ensure_valid_rental, ensure_valid_rental_price_segment,
  -- ensure_valid_maintenance) - daca o valoare introdusa mai sus le-ar
  -- incalca, insert-ul de mai sus ar fi esuat deja si toata tranzactia s-ar
  -- fi facut rollback.

  -------------------------------------------------------------------------
  -- 11. Summary.
  -------------------------------------------------------------------------
  select count(*) into cars_total from public.cars
    where owner_id in (owner_profile_id, viewer_profile_id, editor_profile_id, operator_profile_id)
      and license_plate in (
        'B-201-LGN','B-118-SDR','AG-45-DST','SB-77-MGN','CJ-63-OCT','IS-29-FAB','PH-52-PST','TM-84-GLF',
        'CT-16-COR','BV-38-I30','DB-91-TCS','GL-27-CED','MS-59-FCS','BH-14-AST','B-733-BMW','VL-22-CVC',
        'BR-08-308','BC-46-LEN','CJ-11-SDR','CJ-52-CLI','CJ-77-FAB','CJ-34-COR','CJ-19-FST',
        'TM-22-YRS','TM-63-I20','TM-08-RPD','TM-91-LGN','TM-45-PLO',
        'CT-14-LGN','CT-58-CLI','CT-27-COR','CT-73-FST','CT-36-I10'
      );

  select count(*) into documents_total from public.car_documents d
    join seed_car_map m on m.car_id = d.car_id;
  select count(*) into rentals_total from public.rentals r
    join seed_car_map m on m.car_id = r.car_id;
  select count(*) into segments_total from public.rental_price_segments s
    join public.rentals r on r.id = s.rental_id
    join seed_car_map m on m.car_id = r.car_id;
  select count(*) into maintenance_total from public.maintenance mt
    join seed_car_map m on m.car_id = mt.car_id;

  raise notice 'Seed demo creat: % masini, % documente, % inchirieri, % segmente de pret, % service-uri, 3 relatii fleet_access.',
    cars_total, documents_total, rentals_total, segments_total, maintenance_total;
end $$;

commit;
