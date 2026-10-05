/** Phase 8.1: whether the request can proceed to deterministic execution; a classification only, never changes query results. */
export type AnswerabilityStatus =
  | "answerable"
  | "ambiguous"
  | "not_directly_answerable"
  /** ConversationalFix (2026-09-27): casual chat or capability question, never proceeds to execution. See RuntimeResult.conversationalAnswer. */
  | "conversational";
