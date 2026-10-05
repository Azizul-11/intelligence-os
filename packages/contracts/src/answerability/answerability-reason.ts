/** Optional reason behind an `ambiguous` or `not_directly_answerable` status.
 * `plan-incomplete` (a resolved candidate lost in planning, F12/F13) differs from `semantic-incomplete` (nothing extracted). */
export type AnswerabilityReason =
  | "semantic-incomplete"
  | "plan-incomplete"
  | "candidate-inconsistent"
  | "identity-ambiguous"
  | "capability-unavailable"
  | "data-unavailable";
