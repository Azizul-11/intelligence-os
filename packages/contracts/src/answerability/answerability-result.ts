import type { AnswerabilityStatus } from "./answerability-status";
import type { AnswerabilityReason } from "./answerability-reason";

/**
 * Phase 8.1: minimal, additive, Universal representation of whether a
 * request can proceed to deterministic execution.
 *
 * Domain-agnostic by construction: `candidates` carries whatever opaque
 * identity values a Domain SDK's own `EntityResolutionResult.candidates`
 * already produced (e.g. Healthcare facility_ids) - this contract never
 * inspects or formats them.
 */
export interface AnswerabilityResult {
  status: AnswerabilityStatus;

  reason?: AnswerabilityReason;

  /**
   * Present only when `reason === "identity-ambiguous"`: the candidate
   * identity values that could not be narrowed to exactly one, exactly as
   * reported by the Domain SDK's `EntityResolutionResult.candidates`.
   */
  candidates?: unknown[];
}
