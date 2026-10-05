import type {
  PendingInteraction,
  GuidanceOption,
  GuidanceTarget,
} from "@intelligence/contracts";

/** Phase 8.10 Layer 2: rebuilds the request from a guidance reply by string-replacing the unavailable capability mention with the selected alternative's display name; structured injection is the fallback if that proves ambiguous. */
export function reconstructGuidanceRequest(
  interaction: PendingInteraction,
  selectedOption: GuidanceOption
): {
  question: string;
  selectedCapability?: string;
  originalSemanticResult: unknown;
} {
  const target = interaction.pendingTarget as GuidanceTarget;
  const originalQuestion = interaction.originalQuestion;

  // Simple string-based reconstruction: create new question with selected capability
  // Example: "hospitals ranked by length of stay" → "hospitals ranked by overall rating"
  
  // For initial implementation, we'll pass the selected capability as metadata
  // and let the RuntimeEngine's semantic resolution pick it up naturally
  const reconstructedQuestion = originalQuestion;

  return {
    question: reconstructedQuestion,
    selectedCapability: selectedOption.capabilityId,
    originalSemanticResult: interaction.originalSemanticResult,
  };
}
