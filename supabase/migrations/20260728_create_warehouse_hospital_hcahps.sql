-- =====================================================
-- IntelligenceOS
-- Phase A9
-- Warehouse HCAHPS
-- =====================================================

create table if not exists public.warehouse_hospital_hcahps (

    id uuid primary key default gen_random_uuid(),

    facility_id text not null
        references public.warehouse_hospitals(facility_id),

    measure_code text not null,

    question text not null,

    answer_description text not null,

    patient_survey_star_rating text,

    patient_survey_star_rating_footnote text,

    answer_percent numeric,

    answer_percent_footnote text,

    linear_mean_value numeric,

    completed_surveys integer,

    completed_surveys_footnote text,

    survey_response_rate_percent numeric,

    survey_response_rate_percent_footnote text,

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
idx_hcahps_facility
on public.warehouse_hospital_hcahps (
    facility_id
);

create index if not exists
idx_hcahps_measure
on public.warehouse_hospital_hcahps (
    measure_code
);

create index if not exists
idx_hcahps_reporting_period
on public.warehouse_hospital_hcahps (
    reporting_start_date,
    reporting_end_date
);