begin;

-- run_sql executes arbitrary SQL as its owner, so only the server may call it.
revoke execute on function public.run_sql(text) from public, anon, authenticated;
grant execute on function public.run_sql(text) to service_role;

-- Questions and execution traces are internal; the orchestrator reads them with the service role.
drop policy if exists "Allow public read access" on public.pending_interactions;
drop policy if exists "Allow public read access" on public.phase_execution_trace;
revoke all on table public.pending_interactions, public.phase_execution_trace from anon, authenticated;

-- The public keys cannot write anything in public.
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon, authenticated;

-- Objects created later are not granted to the public keys by default.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;

-- Reference data stays readable with the public key.
grant select on table public.warehouse_hospitals, public.warehouse_states, public.warehouse_counties, public.alias_registry to anon, authenticated;

-- The keep-alive ping reads this table with the public key.
alter table public.keep_alive_logs enable row level security;
drop policy if exists "Allow public read access" on public.keep_alive_logs;
create policy "Allow public read access" on public.keep_alive_logs for select using (true);
grant select on table public.keep_alive_logs to anon, authenticated;

commit;
