import type { SupabaseClient } from "@supabase/supabase-js";
import type { PendingInteraction } from "@intelligence/contracts";

/**
 * Phase 8.10 Layer 2: Retrieve and validate a pending interaction.
 * 
 * Enforces lifecycle checks:
 * - Must exist
 * - Must not be consumed
 * - Must not be expired
 * - If user_id present, must match requestUserId
 * 
 * @param supabase Supabase client
 * @param pendingInteractionId UUID of the pending interaction
 * @param requestUserId Optional user ID from the request (for optional binding)
 * @returns Valid pending interaction
 * @throws Error if interaction not found, consumed, expired, or unauthorized
 */
export async function retrievePendingInteraction(
  supabase: SupabaseClient,
  pendingInteractionId: string,
  requestUserId?: string
): Promise<PendingInteraction> {
  // Retrieve unconsumed, non-expired interaction
  const { data, error } = await supabase
    .from("pending_interactions")
    .select("*")
    .eq("id", pendingInteractionId)
    .eq("consumed", false)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error || !data) {
    throw new Error("Interaction not found, already used, or expired");
  }

  // Optional user binding: if stored user_id exists, validate it matches
  if (data.user_id && data.user_id !== requestUserId) {
    throw new Error("Unauthorized: interaction belongs to another user");
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
