create table warehouse_hospital_readmissions (

    id uuid primary key default gen_random_uuid(),

    facility_id text not null references warehouse_hospitals(facility_id),

    measure_code text not null,

    state text not null,

    number_of_discharges_raw text,

    number_of_readmissions_raw text,

    predicted_readmission_rate numeric,

    expected_readmission_rate numeric,

    excess_readmission_ratio numeric,

    footnote text,

    reporting_start_date date,

    reporting_end_date date,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now(),

    unique (facility_id, measure_code)
);