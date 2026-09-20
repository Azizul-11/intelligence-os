/**
 * Tier0 Task 2 (F8) Phase 2: Query Tracer Observability.
 *
 * Universal, domain-agnostic record of which gates a single request's
 * execution actually passed through, in order - proof, per-request, that
 * Rule 21 ("every query must pass through all completed phases") held for
 * that specific query, not just as a general architectural claim. Never
 * inspects domain-specific values (facility ids, state codes, etc.) -
 * only generic phase names, timestamps, pass/fail status, and SQL call
 * counts, all of which Universal Core already produces or could produce
 * for any Domain SDK.
 *
 * This is diagnostic/evidentiary, not a control mechanism: nothing here
 * changes what create-runtime-engine.ts does - it only records what
 * already happened, in the same strict, single-threaded order the code
 * already executes in. A missing gate in `gates` is only ever possible if
 * the corresponding code path was itself never reached (e.g. an earlier
 * gate already returned) - it is not something this tracker can fake or
 * skip independently of the real control flow.
 */
/**
 * Opaque, flat diagnostic detail a gate's caller may attach to its exit
 * marker (e.g. which service answered, how long it took). Universal Core
 * stores it verbatim and never interprets a key or value.
 */
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

  /**
   * Checks that every phase in `required` was visited at least once.
   * `required` is caller-supplied rather than hardcoded: which gates a
   * given request *should* visit depends on what kind of request it is
   * (e.g. a Layer 2 continuation visits "layer2-continuation"; an
   * ordinary Turn 1 query never does) and on which phases are actually
   * built yet (Phase 9-11 "memory"/"insight" gates don't exist in the
   * codebase yet and are never asserted here - asserting them
   * unconditionally would make every current query "fail" a check for a
   * phase that cannot possibly run, which proves nothing).
   */
  verifyAllPhasesVisited(required: readonly string[]): boolean {
    return required.every((phase) => this.gates.some((gate) => gate.phase === phase));
  }

  totalSqlCalls(): number {
    return this.gates.reduce((sum, gate) => sum + gate.sqlCalls, 0);
  }
}

/**
 * The 7 gates a single query's execution passes through today, in the
 * exact order create-runtime-engine.ts checks them - a strict, single-
 * threaded waterfall (see PRE_PHASE_9_TASK2_F8_CLARIFICATION_AND_TRACER_
 * AUDIT.md's "Linear Choke Point" section for the full research writeup).
 * A request only ever visits a PREFIX of this list - it returns the
 * moment any gate refuses it, so "gate 5 never entered" for a request
 * that stopped at gate 4 is correct and expected, not a defect.
 *
 * Layer 2 continuation requests visit their own separate
 * "layer2-continuation" gate (in the orchestrator's continuation
 * service) before re-entering this same list on their reconstructed
 * question - traced as a distinct request, not appended to Turn 1's.
 */
export const CURRENT_GATES = [
  "semantic-candidate-resolution",
  "entity-identity-ambiguity",
  "execution-plan-building",
  "plan-ambiguity-check",
  "capability-template-availability",
  "parameter-filter-compatibility",
  "deterministic-warehouse-execution",
] as const;
