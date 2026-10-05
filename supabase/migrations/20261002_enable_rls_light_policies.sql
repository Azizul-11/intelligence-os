-- Security: RLS on every table. The anon key is public (bundled in the browser) and would otherwise allow direct PostgREST access; the orchestrator uses service_role, which bypasses RLS.
-- Policy: public SELECT only (public CMS data, ephemeral trace rows); with no write policy, writes stay blocked.

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
