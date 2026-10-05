/** Phase 8.3: re-export of the domain-sdk runtime types used by `identityAmbiguities`, so dependents of semantic avoid a new direct dependency. */
export type {
  EntityResolutionResult,
  AmbiguousCandidate,
} from "@intelligence/domain-sdk";
