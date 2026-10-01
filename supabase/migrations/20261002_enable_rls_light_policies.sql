-- =====================================================
-- IntelligenceOS
-- Security hardening: enable RLS on every table tracked
-- in this migrations folder.
--
-- Why: the orchestrator edge function always connects with the
-- service_role key (supabase/functions/shared/supabase.ts), which
-- bypasses RLS regardless of policy - so this changes nothing about
-- how the app itself reads or writes data. What it does close is the
-- public anon key (bundled into the browser build) being usable to
-- query these tables directly over PostgREST, bypassing the
-- orchestrator entirely, since every table here currently has RLS
-- disabled (Postgres grants that key full read/write once a schema
-- is exposed, with no policy standing in the way).
--
-- Policy shape (deliberately light, one pattern everywhere): allow
-- SELECT for anyone, no INSERT/UPDATE/DELETE policy at all. Reading
-- this data isn't sensitive (public CMS hospital-quality data, plus
-- ephemeral continuation/trace rows with no auth system attached to
-- them) - writing it from outside the app never should be, and stays
-- blocked by default the moment RLS is enabled with no write policy.
-- =====================================================

alter table public.warehouse_hospitals enable row level security;
alter table public.warehouse_states enable row level security;
alter table public.warehouse_counties enable row level security;
alter table public.dataset_registry enable row level security;
alter table public.pipeline_runs enable row level security;

alter table public.entity_registry enable row level security;
alter table public.metric_registry enable row level security;
alter table public.dimension_registry enable row level security;
alter table public.category_registry enable row level security;
alter table public.alias_registry enable row level security;
alter table public.benchmark_registry enable row level security;
alter table public.relationship_registry enable row level security;

alter table public.warehouse_hospital_clinical_outcomes enable row level security;
alter table public.warehouse_hospital_hcahps enable row level security;
alter table public.warehouse_hospital_readmissions enable row level security;

alter table public.pending_interactions enable row level security;
alter table public.phase_execution_trace enable row level security;

create policy "Allow public read access" on public.warehouse_hospitals for select using (true);
create policy "Allow public read access" on public.warehouse_states for select using (true);
create policy "Allow public read access" on public.warehouse_counties for select using (true);
create policy "Allow public read access" on public.dataset_registry for select using (true);
create policy "Allow public read access" on public.pipeline_runs for select using (true);

create policy "Allow public read access" on public.entity_registry for select using (true);
create policy "Allow public read access" on public.metric_registry for select using (true);
create policy "Allow public read access" on public.dimension_registry for select using (true);
create policy "Allow public read access" on public.category_registry for select using (true);
create policy "Allow public read access" on public.alias_registry for select using (true);
create policy "Allow public read access" on public.benchmark_registry for select using (true);
create policy "Allow public read access" on public.relationship_registry for select using (true);

create policy "Allow public read access" on public.warehouse_hospital_clinical_outcomes for select using (true);
create policy "Allow public read access" on public.warehouse_hospital_hcahps for select using (true);
create policy "Allow public read access" on public.warehouse_hospital_readmissions for select using (true);

create policy "Allow public read access" on public.pending_interactions for select using (true);
create policy "Allow public read access" on public.phase_execution_trace for select using (true);
