import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PendingInteraction,
  ClarificationTarget,
  GuidanceTarget,
  ClarificationOption,
  GuidanceOption,
} from "@intelligence/contracts";
import type { SemanticResolutionResult } from "@intelligence/semantic";

/** Phase 8.10 Layer 2: stores the minimum state to rebuild a request after a clarification/guidance reply; NOT conversation memory, bounded two-turn only. */
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
      // expires_at (5 min), consumed (FALSE) and created_at (NOW) are DB defaults
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
