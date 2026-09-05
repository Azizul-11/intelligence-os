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

  /**
   * Phase 8.9: present only when `reason === "capability-unavailable"`:
   * other real, currently supported capabilities that could execute the
   * same request shape (same operation, same filters/scope) in place of
   * the one that was unavailable. Opaque capability identifiers only -
   * never a score, priority, or guidance string. Universal Core never
   * inspects what a given id means; a Domain SDK's own metric ids are
   * the only content here. Absent (not merely empty) when discovery
   * found nothing, to distinguish "checked, found none" only at the
   * point of construction - callers should treat a missing field and an
   * empty array identically.
   */
  alternatives?: { capabilityId: string }[];
}
