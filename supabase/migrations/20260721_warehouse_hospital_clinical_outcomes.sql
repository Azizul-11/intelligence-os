-- =====================================================
-- IntelligenceOS
-- Phase 4.4
-- Warehouse Clinical Outcomes
-- =====================================================

create table if not exists public.warehouse_hospital_clinical_outcomes (

    id uuid primary key default gen_random_uuid(),

    facility_id text not null
        references public.warehouse_hospitals(facility_id),

    measure_code text not null,

    measure_name text not null,

    compared_to_national text,

    denominator integer,

    score numeric,

    lower_estimate numeric,

    higher_estimate numeric,

    footnote text,

    reporting_start_date date not null,

    reporting_end_date date not null,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now(),

    unique (
        facility_id,
        measure_code,
        reporting_start_date,
        reporting_end_date
    )

);

create index if not exists
idx_clinical_outcomes_facility
on public.warehouse_hospital_clinical_outcomes (
    facility_id
);

create index if not exists
idx_clinical_outcomes_measure
on public.warehouse_hospital_clinical_outcomes (
    measure_code
);

create index if not exists
idx_clinical_outcomes_reporting_period
on public.warehouse_hospital_clinical_outcomes (
    reporting_start_date,
    reporting_end_date
);