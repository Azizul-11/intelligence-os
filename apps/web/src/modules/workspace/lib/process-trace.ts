import type { ChatResponse, LlmCall, PhaseGateTraceEntry } from "../api/orchestrator";

// Display names for every phase the backend can emit. A phase not listed here shows as "Pipeline step" with its raw key in
// a tooltip, so a new backend phase never shows up as a raw identifier.
const PHASE_LABELS: Record<string, string> = {
  "conversational-check": "Conversation check",
  "semantic-candidate-resolution": "Semantic extraction",
  "entity-identity-ambiguity": "Entity resolution",
  "execution-plan-building": "Plan building",
  "plan-ambiguity-check": "Ambiguity check",
  "capability-template-availability": "Capability check",
  "parameter-filter-compatibility": "Filter compatibility",
  "deterministic-warehouse-execution": "Warehouse execution",
  "unaccounted-word-guard": "Unaccounted word check",
  "qualifier-restore": "Qualifier restore",
  "llm-normalization": "Question normalization",
  response: "Result returned",
};

// The core gates a query passes through in order. One that never appears in a trace is shown as skipped.
const CORE_GATES = [
  "semantic-candidate-resolution",
  "entity-identity-ambiguity",
  "execution-plan-building",
  "plan-ambiguity-check",
  "capability-template-availability",
  "parameter-filter-compatibility",
  "deterministic-warehouse-execution",
];

// Statuses counting as passed: "enter" alone means the pipeline moved on; "annotated"/"restored" are non-error; "dry-run" never queried the warehouse.
const PASSED_STATUSES = new Set([
  "ok",
  "enter",
  "rewritten",
  "unchanged",
  "analytical",
  "conversational",
  "annotated",
  "restored",
  "dry-run",
]);
// Anything else is a halt, and its raw status (for example "ambiguous" or "not-found") is shown as the reason.
const SKIPPED_STATUSES = new Set(["skipped", "not-applicable", "not_applicable"]);

export const ROLE_LABELS: Record<LlmCall["role"], string> = {
  normalizer: "Question normalizer",
  summary: "Summary",
  suggestions: "Follow-up suggestions",
  conversational: "Conversational reply",
  intent: "Intent check",
};

export type StepStatus = "completed" | "skipped" | "halted";

export type ProcessStep = {
  phase: string;
  label: string;
  known: boolean;
  status: StepStatus;
  // The backend's own status text for a halted step, e.g. "ambiguous" or "not_directly_answerable".
  reason?: string;
  // Time from this step's first entry to the next step's first entry. Absent for the last step.
  durationMs?: number;
  // The backend's diagnostic payload for this step. Absent when the backend sent none, and then the step is not expandable.
  detail?: Record<string, string | number | boolean>;
};

export type ProcessTimings = {
  serverMs?: number;
  browserMs?: number;
  networkMs?: number;
  warehouseMs?: number;
};

export function phaseLabel(phase: string): { label: string; known: boolean } {
  const label = PHASE_LABELS[phase];
  return label ? { label, known: true } : { label: "Pipeline step", known: false };
}

function statusOf(raw: string): StepStatus {
  if (PASSED_STATUSES.has(raw)) return "completed";
  if (SKIPPED_STATUSES.has(raw)) return "skipped";
  return "halted";
}

// Builds the step ledger from a trace. A phase can appear several times (an enter and an exit), so each phase is shown
// once, in the order it first appears, with its last recorded status. The response step always comes last.
export function buildSteps(trace: PhaseGateTraceEntry[]): ProcessStep[] {
  const order: string[] = [];
  const entriesByPhase = new Map<string, PhaseGateTraceEntry[]>();

  for (const gate of trace) {
    if (!entriesByPhase.has(gate.phase)) {
      order.push(gate.phase);
      entriesByPhase.set(gate.phase, []);
    }
    entriesByPhase.get(gate.phase)!.push(gate);
  }

  const traced = order.map((phase, index): ProcessStep => {
    const gates = entriesByPhase.get(phase)!;
    const gate = gates[gates.length - 1];
    const nextPhase = order[index + 1];
    const endAt = nextPhase !== undefined ? entriesByPhase.get(nextPhase)![0].timestamp : undefined;
    const status = statusOf(gate.status);
    const { label, known } = phaseLabel(phase);
    const detail = Object.assign({}, ...gates.map((entry) => entry.detail ?? {}));
    return {
      phase,
      label,
      known,
      status,
      reason: status === "halted" ? gate.status : undefined,
      durationMs: endAt !== undefined ? Math.max(0, endAt - gates[0].timestamp) : undefined,
      detail: Object.keys(detail).length > 0 ? detail : undefined,
    };
  });

  const notReached = CORE_GATES.filter((phase) => !entriesByPhase.has(phase)).map((phase): ProcessStep => {
    const { label, known } = phaseLabel(phase);
    return { phase, label, known, status: "skipped" };
  });

  const body = traced.filter((step) => step.phase !== "response");
  const response = traced.filter((step) => step.phase === "response");
  return [...body, ...notReached, ...response];
}

export function buildTimings(result: Partial<ChatResponse>, clientMs?: number): ProcessTimings {
  const trace = result.trace ?? [];
  const execution = trace.find((gate) => gate.phase === "deterministic-warehouse-execution");
  const response = trace.find((gate) => gate.phase === "response");
  const serverMs = result.metadata?.executionTimeMs;
  return {
    serverMs,
    browserMs: clientMs,
    networkMs: clientMs !== undefined && serverMs !== undefined ? Math.max(0, clientMs - serverMs) : undefined,
    warehouseMs: execution && response ? response.timestamp - execution.timestamp : undefined,
  };
}

export function fmtMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}
