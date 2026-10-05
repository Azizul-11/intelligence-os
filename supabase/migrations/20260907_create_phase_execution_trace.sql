-- Tier0 Task 2 (F8) Phase 2: Query Tracer. One row per HTTP request; the gates visited are one jsonb array matching PhaseGateTracker.gates
-- (see packages/runtime-engine/src/phase-gate-tracker.ts). Diagnostic only, never read back by the runtime; confirms Rule 21 held for a real request.
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
