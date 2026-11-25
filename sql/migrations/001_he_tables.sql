-- Higher Education campus tables (IPEDS UNITID spine + optional CCC codes)
-- Run after sql/setup.sql

-- Campuses configured for synchronization (roster).
create table if not exists public.he_sync_campuses (
  unitid text primary key,
  inst_name text not null,
  state_code text not null default 'CA',
  system_name text,
  ccc_district text,
  ccc_college_code text,
  enabled boolean not null default true,
  sync_years int[] not null default '{2019,2020,2021,2022,2023}',
  notes text,
  last_synced timestamptz
);

-- Directory facts from IPEDS HD / IC (× year when survey fields vary).
create table if not exists public.he_campus_directory (
  unitid text not null,
  year int not null,
  inst_name text,
  opeid text,
  system_name text,
  sector text,
  control text,
  state_code text,
  city text,
  latitude numeric,
  longitude numeric,
  ccc_district text,
  ccc_college_code text,
  parent_unitid text,
  is_branch boolean default false,
  raw_data jsonb not null default '{}'::jsonb,
  last_synced timestamptz not null default now(),
  primary key (unitid, year)
);

create index if not exists he_campus_directory_state_idx
  on public.he_campus_directory (state_code, year);

create index if not exists he_campus_directory_system_idx
  on public.he_campus_directory (system_name, year);

-- Fall enrollment (IPEDS EF) — campus × year aggregates for MVP.
create table if not exists public.he_enrollment_fall (
  unitid text not null,
  year int not null,
  headcount_total int,
  headcount_ug int,
  headcount_grad int,
  headcount_ft int,
  headcount_pt int,
  raw_data jsonb not null default '{}'::jsonb,
  last_synced timestamptz not null default now(),
  primary key (unitid, year)
);

-- 12-month / instructional activity (IPEDS E12 / EFFY) + CCC FTES when available.
create table if not exists public.he_enrollment_activity (
  unitid text not null,
  year int not null,
  unduplicated_headcount int,
  ftes numeric,
  credit_hours numeric,
  raw_data jsonb not null default '{}'::jsonb,
  last_synced timestamptz not null default now(),
  primary key (unitid, year)
);

-- Completions by CIP (IPEDS C). CCC TOP can land in cip6/cip_title until a TOP column is added.
create table if not exists public.he_completions (
  unitid text not null,
  year int not null,
  cip6 text not null,
  cip_title text,
  award_level text not null default 'Total',
  awards int,
  raw_data jsonb not null default '{}'::jsonb,
  last_synced timestamptz not null default now(),
  primary key (unitid, year, cip6, award_level)
);

create index if not exists he_completions_year_idx
  on public.he_completions (year);

create table if not exists public.he_sync_log (
  id bigint generated always as identity primary key,
  unitid text,
  dataset text not null,
  year int,
  status text not null check (status in ('started', 'success', 'error')),
  records_upserted int not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists he_sync_log_unitid_idx
  on public.he_sync_log (unitid, started_at desc);

-- Seed roster for CA pilot (matches data/seed/campuses.json UNITIDs).
insert into public.he_sync_campuses (
  unitid, inst_name, state_code, system_name, ccc_district, ccc_college_code, notes
) values
  ('110635', 'University of California-Berkeley', 'CA', 'UC', null, null, 'Seed pilot'),
  ('110662', 'University of California-Los Angeles', 'CA', 'UC', null, null, 'Seed pilot'),
  ('110644', 'University of California-Davis', 'CA', 'UC', null, null, 'Seed pilot'),
  ('110583', 'California State University-Long Beach', 'CA', 'CSU', null, null, 'Seed pilot'),
  ('122597', 'San Francisco State University', 'CA', 'CSU', null, null, 'Seed pilot'),
  ('110422', 'California Polytechnic State University-San Luis Obispo', 'CA', 'CSU', null, null, 'Seed pilot'),
  ('122296', 'City College of San Francisco', 'CA', 'CCC', 'San Francisco CCD', '361', 'Seed pilot'),
  ('123554', 'Santa Monica College', 'CA', 'CCC', 'Santa Monica CCD', '781', 'Seed pilot'),
  ('113333', 'De Anza College', 'CA', 'CCC', 'Foothill-De Anza CCD', '421', 'Seed pilot'),
  ('114789', 'Foothill College', 'CA', 'CCC', 'Foothill-De Anza CCD', '422', 'Seed pilot'),
  ('121044', 'Pasadena City College', 'CA', 'CCC', 'Pasadena Area CCD', '651', 'Seed pilot'),
  ('122180', 'Sacramento City College', 'CA', 'CCC', 'Los Rios CCD', '231', 'Seed pilot'),
  ('120342', 'Orange Coast College', 'CA', 'CCC', 'Coast CCD', '861', 'Seed pilot'),
  ('113634', 'Diablo Valley College', 'CA', 'CCC', 'Contra Costa CCD', '311', 'Seed pilot')
on conflict (unitid) do update set
  inst_name = excluded.inst_name,
  system_name = excluded.system_name,
  ccc_district = excluded.ccc_district,
  ccc_college_code = excluded.ccc_college_code,
  notes = excluded.notes;
