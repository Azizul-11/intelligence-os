/**
 * Phase 8.3: targeted re-export of the two Universal domain-sdk runtime
 * types `SemanticResolutionResult.identityAmbiguities` already depends
 * on, so packages that already depend on `@intelligence/semantic` (e.g.
 * `@intelligence/runtime-engine`) can consume them without adding a new
 * direct package dependency - the exact same pattern already
 * established for `AnswerabilityResult` in `../answerability`.
 */
export type {
  EntityResolutionResult,
  AmbiguousCandidate,
} from "@intelligence/domain-sdk";
