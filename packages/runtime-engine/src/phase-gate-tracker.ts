/** Tier0 Task 2 (F8) Phase 2: domain-agnostic per-request record of the gates executed, in order - proof Rule 21 held for that query; only phase names, timestamps, status and SQL call counts.
 * Diagnostic only, never a control mechanism: a missing gate means that code path was never reached. */
/** Opaque flat diagnostic detail attached to a gate's exit marker; stored verbatim, never interpreted. */
export type PhaseGateDetail = Readonly<Record<string, string | number | boolean>>;

export interface PhaseGateEntry {
  phase: string;
  timestamp: number;
  /** "enter" for a gate's entry marker; a free-form outcome (e.g. "ok",
   * "refused", "unresolved") for its exit marker. */
  status: string;
  sqlCalls: number;
  answerability?: string;
  detail?: PhaseGateDetail;
}

export class PhaseGateTracker {
  readonly requestId: string;
  readonly query: string;
  readonly gates: PhaseGateEntry[] = [];

  constructor(requestId: string, query: string) {
    this.requestId = requestId;
    this.query = query;
  }

  enter(phase: string): void {
    this.gates.push({ phase, timestamp: Date.now(), status: "enter", sqlCalls: 0 });
  }

  exit(phase: string, status: string, sqlCalls: number, answerability?: string, detail?: PhaseGateDetail): void {
    this.gates.push({
      phase,
      timestamp: Date.now(),
      status,
      sqlCalls,
      ...(answerability !== undefined ? { answerability } : {}),
      ...(detail !== undefined ? { detail } : {}),
    });
  }

  /** Checks that every phase in `required` was visited at least once; `required` is caller-supplied since gates depend on request kind (e.g. only continuations visit "layer2-continuation")
   * and Phase 9-11 "memory"/"insight" gates don't exist yet, so asserting them would fail every query. */
  verifyAllPhasesVisited(required: readonly string[]): boolean {
    return required.every((phase) => this.gates.some((gate) => gate.phase === phase));
  }

  totalSqlCalls(): number {
    return this.gates.reduce((sum, gate) => sum + gate.sqlCalls, 0);
  }
}

/** The 7 gates a query passes through, in the order create-runtime-engine.ts checks them (strict single-threaded waterfall, see PRE_PHASE_9_TASK2_F8_CLARIFICATION_AND_TRACER_AUDIT.md "Linear Choke Point").
 * A request visits only a PREFIX of the list (it returns when a gate refuses); Layer 2 continuations trace separately via "layer2-continuation", not appended to Turn 1's. */
export const CURRENT_GATES = [
  "semantic-candidate-resolution",
  "entity-identity-ambiguity",
  "execution-plan-building",
  "plan-ambiguity-check",
  "capability-template-availability",
  "parameter-filter-compatibility",
  "deterministic-warehouse-execution",
] as const;
