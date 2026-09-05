import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PendingInteraction,
  ClarificationTarget,
  GuidanceTarget,
  ClarificationOption,
  GuidanceOption,
} from "@intelligence/contracts";
import type { SemanticResolutionResult } from "@intelligence/semantic";

/**
 * Phase 8.10 Layer 2: Create a pending clarification or guidance interaction.
 * 
 * This stores the minimum state needed to reconstruct a complete request after
 * the user responds to a clarification or guidance prompt. NOT general
 * conversation memory - bounded two-turn only.
 * 
 * @param supabase Supabase client for database access
 * @param params Interaction parameters
 * @returns Created pending interaction with generated ID
 */
export async function createPendingInteraction(
  supabase: SupabaseClient,
  params: {
    kind: "clarification" | "guidance";
    userId?: string;
    originalQuestion: string;
    originalSemanticResult: SemanticResolutionResult | unknown;
    pendingTarget: ClarificationTarget | GuidanceTarget;
    offeredOptions: ClarificationOption[] | GuidanceOption[];
  }
): Promise<PendingInteraction> {
  const { data, error } = await supabase
    .from("pending_interactions")
    .insert({
      kind: params.kind,
      user_id: params.userId || null,
      original_question: params.originalQuestion,
      original_semantic_result: params.originalSemanticResult,
      pending_target: params.pendingTarget,
      offered_options: params.offeredOptions,
      // expires_at has DEFAULT (NOW() + INTERVAL '5 minutes')
      // consumed has DEFAULT FALSE
      // created_at has DEFAULT NOW()
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create pending interaction: ${error.message}`);
  }

  if (!data) {
    throw new Error("Failed to create pending interaction: no data returned");
  }

  return {
    id: data.id,
    kind: data.kind as "clarification" | "guidance",
    userId: data.user_id || undefined,
    originalQuestion: data.original_question,
    originalSemanticResult: data.original_semantic_result,
    pendingTarget: data.pending_target,
    offeredOptions: data.offered_options,
    expiresAt: data.expires_at,
    consumed: data.consumed,
    createdAt: data.created_at,
  };
}
