/**
 * Phase 8.1: whether the current architecture can proceed to deterministic
 * execution for a given request.
 *
 * This is a classification of the request's current state, not an
 * interpretation engine - it carries no analytical meaning of its own and
 * never changes what a successfully-executed query returns.
 */
export type AnswerabilityStatus =
  | "answerable"
  | "ambiguous"
  | "not_directly_answerable"
  /**
   * ConversationalFix (2026-09-27): the request was casual conversation or a capability question, not a real
   * request for data - never proceeds to deterministic execution by construction. See RuntimeResult.conversationalAnswer.
   */
  | "conversational";
