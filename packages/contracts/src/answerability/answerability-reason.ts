/**
 * Phase 8.1: an optional, specific reason behind an `AnswerabilityStatus`
 * of `"ambiguous"` or `"not_directly_answerable"`.
 *
 * Each value here corresponds to a gate that already exists somewhere in
 * the architecture today (see the Phase 8.1 architecture audit,
 * `docs/phase8/8.1/PHASE_8_1_ARCHITECTURE_AUDIT.md`, Section 8) - this is
 * deliberately not a speculative taxonomy. `capability-unavailable` and
 * `data-unavailable` are declared here for the shape's completeness but
 * their detection mechanisms are future Phase 8.5/8.6 work, not built by
 * Phase 8.1.
 *
 * Phase 8.2 (`docs/phase8/8.2/PHASE_8_2_ARCHITECTURE_AUDIT.md`, Blocker
 * Resolution Section 6): `plan-incomplete` is deliberately distinct from
 * `semantic-incomplete`. `semantic-incomplete` means nothing meaningful
 * was extracted from the request at all. `plan-incomplete` means a
 * specific, genuinely resolved candidate survived every legitimate
 * planner filter and still failed to reach the ExecutionPlan - an
 * unaccounted-for planning-representation loss (the F12/F13 lineage),
 * not an input-completeness problem.
 */
export type AnswerabilityReason =
  | "semantic-incomplete"
  | "plan-incomplete"
  | "candidate-inconsistent"
  | "identity-ambiguous"
  | "capability-unavailable"
  | "data-unavailable";
