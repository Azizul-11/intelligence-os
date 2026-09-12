import type { PlanCompletenessReport } from "@intelligence/query-planner";
import type { AnswerabilityResult } from "@intelligence/semantic";
import type { CoverageFact } from "./coverage-fact";
import type { PhaseGateEntry } from "./phase-gate-tracker";

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

  /**
   * Phase 8.6C: purely evidentiary, policy-neutral population-coverage
   * facts - one entry per metric whose resolved template declared a
   * companion `coverageTemplateId` (see SqlTemplateDefinition). Present
   * only on a successful "rank"/"aggregate" execution where at least
   * one involved metric's template opted in; never present otherwise.
   * Additive and diagnostic: nothing about success/failure, `rows`, or
   * `rowCount` changes because this field exists or because coverage
   * is incomplete. Deliberately carries no interpretation of the
   * numbers - no policy, no threshold, no disclosure text - that
   * remains a later, separately-authorized answerability/guidance
   * decision.
   */
  coverage?: CoverageFact[];

  /**
   * Tier0 Task 2 (F8) Phase 2: the ordered gate trace PhaseGateTracker
   * recorded for this exact execution - present on every response,
   * whatever gate it stopped at. Diagnostic only, additive: nothing about
   * success/failure or any other field changes because this is present.
   */
  trace?: PhaseGateEntry[];

  /**
   * Tier0 Task 6: present only on an identity-ambiguous refusal - the
   * semantic candidates (metric/concept/dimension/etc, never the
   * ambiguous entity itself) this request already resolved before the
   * entity-identity-ambiguity gate refused it. Opaque (`unknown[]`, no
   * `@intelligence/semantic` type import here, mirroring
   * PendingInteraction.originalSemanticResult's own "avoid circular
   * dependencies" reasoning) so a Layer 2 continuation's Turn 1
   * pending-interaction can actually carry forward the context its own
   * `originalSemanticResult` field was always documented to hold,
   * instead of the empty placeholder it stored before. Diagnostic/
   * carry-forward only: nothing about this request's own success or
   * failure changes because this field exists.
   */
  semanticMatches?: unknown[];

  /**
   * Tier1 Task 6: 2-3 short, independently clickable follow-up question
   * texts - present on BOTH success and failure paths, never absent by
   * omission alone (an empty array is a valid "nothing to suggest right
   * now" signal; the field itself is always populated when a Domain SDK
   * implements `DomainExecutionStrategy.generateSuggestions`).
   * Deterministic, rule-based for Tier 1 - the same field can be
   * populated by an LLM call later with zero contract change; callers
   * must never assume which produced it.
   *
   * Every entry here has already been dry-run validated by
   * create-runtime-engine.ts (re-executed end-to-end and confirmed
   * `success && rowCount > 0`) before being surfaced - never a candidate
   * that would itself fail if clicked.
   */
  suggestions?: string[];
}