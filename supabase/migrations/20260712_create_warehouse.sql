-- =====================================================
-- IntelligenceOS
-- Phase 4.2
-- Warehouse Schema
-- =====================================================

-- -----------------------------------------------------
-- Hospitals
-- -----------------------------------------------------

create table if not exists public.warehouse_hospitals (

    facility_id text primary key,

    hospital_name text not null,

    address text,

    city text,

    state text,

    zip_code text,

    county text,

    phone_number text,

    hospital_type text,

    ownership text,

    emergency_services boolean,

    birthing_friendly text,

    overall_rating text,

    overall_rating_footnote text,

    mort_group_measure_count integer,

    facility_mort_measure_count integer,

    mort_measures_better integer,

    mort_measures_no_different integer,

    mort_measures_worse integer,

    mort_group_footnote text,

    safety_group_measure_count integer,

    facility_safety_measure_count integer,

    safety_measures_better integer,

    safety_measures_no_different integer,

    safety_measures_worse integer,

    safety_group_footnote text,

    readm_group_measure_count integer,

    facility_readm_measure_count integer,

    readm_measures_better integer,

    readm_measures_no_different integer,

    readm_measures_worse integer,

    readm_group_footnote text,

    patient_experience_group_measure_count integer,

    facility_patient_experience_measure_count integer,

    patient_experience_group_footnote text,

    te_group_measure_count integer,

    facility_te_measure_count integer,

    te_group_footnote text,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()

);

-- -----------------------------------------------------
-- States
-- -----------------------------------------------------

create table if not exists public.warehouse_states (

    id uuid primary key default gen_random_uuid(),

    state_code text not null unique,

    created_at timestamptz not null default now()

);

-- -----------------------------------------------------
-- Counties
-- -----------------------------------------------------

create table if not exists public.warehouse_counties (

    id uuid primary key default gen_random_uuid(),

    state_code text not null,

    county_name text not null,

    created_at timestamptz not null default now(),

    unique(state_code, county_name)

);

-- -----------------------------------------------------
-- Dataset Registry
-- -----------------------------------------------------

create table if not exists public.dataset_registry (

    dataset_id text primary key,

    dataset_name text not null,

    domain text,

    provider text,

    source text,

    version text,

    format text,

    row_count integer,

    column_count integer,

    checksum text,

    last_ingested_at timestamptz,

    created_at timestamptz not null default now()

);

-- -----------------------------------------------------
-- Pipeline Runs
-- -----------------------------------------------------

create table if not exists public.pipeline_runs (

    id uuid primary key default gen_random_uuid(),

    dataset_id text not null,

    status text not null,

    rows_processed integer default 0,

    rows_inserted integer default 0,

    rows_failed integer default 0,

    started_at timestamptz not null default now(),

    finished_at timestamptz,

    duration_ms integer

);