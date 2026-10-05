import type {
  PendingInteraction,
  ClarificationOption,
  ClarificationTarget,
} from "@intelligence/contracts";

/** Phase 8.10 Layer 2: rebuilds the request from a clarification reply as the original question plus the selected identity, which RuntimeEngine injects into the semantic context (bypassing EntityResolver's ambiguity); string substitution is a possible future alternative. */
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
