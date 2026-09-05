import type {
  PendingInteraction,
  ClarificationOption,
  ClarificationTarget,
} from "@intelligence/contracts";

/**
 * Phase 8.10 Layer 2: Reconstruct a complete request from a clarification
 * continuation.
 * 
 * For now, this returns the original question along with metadata about the
 * selected identity. The RuntimeEngine will inject this resolved identity
 * directly into the semantic context, bypassing EntityResolver's ambiguity.
 * 
 * Future: May implement string-based substitution if needed, but initial
 * approach is structured injection.
 * 
 * @param interaction Pending clarification interaction
 * @param selectedOption User-selected clarification option
 * @returns Reconstructed request context
 */
export function reconstructClarificationRequest(
  interaction: PendingInteraction,
  selectedOption: ClarificationOption
): {
  question: string;
  forcedIdentity?: unknown; // Domain-specific identity (e.g., facility_id for Healthcare)
  originalSemanticResult: unknown;
} {
  const target = interaction.pendingTarget as ClarificationTarget;

  // For clarification, preserve original question and provide forced identity
  // The RuntimeEngine will use this to bypass ambiguity during semantic resolution
  return {
    question: interaction.originalQuestion,
    forcedIdentity: selectedOption, // Domain-specific candidate
    originalSemanticResult: interaction.originalSemanticResult,
  };
}
