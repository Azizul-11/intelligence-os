/**
 * Phase 8.1: targeted re-export of the Universal Answerability contract
 * from `@intelligence/contracts`, so packages that already depend on
 * `@intelligence/semantic` (e.g. `@intelligence/runtime-engine`) can
 * consume it without adding a new direct package dependency.
 */
export type {
  AnswerabilityStatus,
  AnswerabilityReason,
  AnswerabilityResult,
} from "@intelligence/contracts";
