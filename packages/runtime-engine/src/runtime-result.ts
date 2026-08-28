import type { PlanCompletenessReport } from "@intelligence/query-planner";
import type { AnswerabilityResult } from "@intelligence/semantic";

export interface RuntimeResult<T = unknown> {
  success: boolean;

  rows: T[];

  rowCount: number;

  error?: string;

  /**
   * Pre-Phase 8 semantic-completeness check: whether every semantically
   * resolved candidate was accounted for in the ExecutionPlan that
   * produced this result. Diagnostic only - present only on a
   * successful execution where a plan was actually built; never
   * present, and never inspected, on any failure path. Domain-agnostic,
   * additive, and not yet consumed by any caller - reserved for a
   * future Phase 8 answerability layer.
   */
  completeness?: PlanCompletenessReport;

  /**
   * Phase 8.1: structured classification of whether this request could
   * proceed to deterministic execution. Present on every response - a
   * generalization of four gates that already existed as separate ad hoc
   * checks (unresolved semantic result, unsupported negation, a detected
   * direction contradiction, and zero resolved metrics), plus the new
   * identity-ambiguity signal (see SemanticResolutionResult.
   * identityAmbiguities). Additive and diagnostic: nothing about which
   * requests succeed or fail, or their existing error text, changes
   * because this field exists.
   */
  answerability?: AnswerabilityResult;
}