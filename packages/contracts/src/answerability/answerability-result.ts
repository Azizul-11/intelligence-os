import type { AnswerabilityStatus } from "./answerability-status";
import type { AnswerabilityReason } from "./answerability-reason";

/** Whether a request can proceed to deterministic execution; `candidates` are opaque Domain SDK identity values, never inspected here. */
export interface AnswerabilityResult {
  status: AnswerabilityStatus;

  reason?: AnswerabilityReason;

  /** Set only when `reason === "identity-ambiguous"`: candidate identities not narrowed to one, as reported by the Domain SDK. */
  candidates?: unknown[];

  /** Phase 8.9: set only when `reason === "capability-unavailable"`: opaque ids of supported capabilities that could run the same request shape.
   * Absent and empty are equivalent. */
  alternatives?: { capabilityId: string }[];
}
