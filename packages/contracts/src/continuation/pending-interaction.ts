/** Phase 8.10 Layer 2: bounded state for a pending clarification/guidance (not conversation memory).
 * Lifecycle Create > Pending > Match > Consume > Delete; TTL 5 min; two-turn only. */
export interface PendingInteraction {
  /** UUID v4 identifier (server-generated) */
  id: string;
  
  /** Type of pending interaction */
  kind: "clarification" | "guidance";
  
  /** Optional user identifier for authenticated flows. If present, only this user can consume. */
  userId?: string;
  
  /** Original user question text */
  originalQuestion: string;
  
  /** Turn 1 semantic result for reconstruction; `unknown` to avoid a circular dependency (real type: SemanticResolutionResult from @intelligence/semantic). */
  originalSemanticResult: unknown;
  
  /** Specific ambiguity or unavailability that triggered this interaction */
  pendingTarget: ClarificationTarget | GuidanceTarget;
  
  /** Options offered to user for deterministic matching */
  offeredOptions: ClarificationOption[] | GuidanceOption[];
  
  /** Expiration timestamp (5 minutes from creation) */
  expiresAt: string; // ISO timestamp
  
  /** Whether this interaction has been successfully consumed */
  consumed: boolean;
  
  /** Creation timestamp */
  createdAt: string; // ISO timestamp
}

/** Clarification target: an ambiguous entity mention needing user disambiguation. */
export interface ClarificationTarget {
  /** The ambiguous entity mention from original query */
  entityMention: string;
  
  /** Ambiguous candidates from entity resolution (domain-specific structure) */
  candidates: unknown[];
}

/** Guidance target: an unavailable capability with offered alternatives. */
export interface GuidanceTarget {
  /** The capability ID that was unavailable */
  unavailableCapabilityId: string;
  
  /** The requested operation (e.g., "rank", "filter") */
  requestedOperation: string;
  
  /** Original scope/filters to preserve during reconstruction */
  scope: Record<string, unknown>;
}

/** Clarification option: one selectable candidate entity (structure is domain-specific; Healthcare shown). */
export interface ClarificationOption {
  /** Display label shown to user (e.g., "NORTHWEST MEDICAL CENTER - TUCSON, AZ") */
  displayLabel: string;
  
  /** Domain-specific identity fields (opaque to Universal Core) */
  [key: string]: unknown;
}

/** Guidance option: a single alternative capability that user can select. */
export interface GuidanceOption {
  /** Capability identifier (e.g., "hospital-overall-rating") */
  capabilityId: string;
  
  /** Human-readable display name (e.g., "Hospital Overall Rating") */
  displayName: string;
}
