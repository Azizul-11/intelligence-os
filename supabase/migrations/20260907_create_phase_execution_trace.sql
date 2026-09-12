-- Tier0 Task 2 (F8) Phase 2: Query Tracer Observability.
--
-- Persists, per HTTP request, the ordered list of gates that request's
-- execution actually visited (see packages/runtime-engine/src/
-- phase-gate-tracker.ts). Purely evidentiary/diagnostic - nothing in the
-- runtime reads this table back to make a decision; it exists so a human
-- (or the frontend pipeline view) can confirm, after the fact, that Rule
-- 21 held for a specific real request.
--
-- One row per request (not one row per gate): the full ordered gate list
-- is stored as a single jsonb array, matching PhaseGateTracker.gates
-- verbatim. Avoids N inserts per request for N gates.
create table phase_execution_trace (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  query_text text not null,
  answerability_status text,
  sql_calls int not null default 0,
  gates jsonb not null,
  execution_plan jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index on phase_execution_trace (request_id);
create index on phase_execution_trace (created_at desc);
