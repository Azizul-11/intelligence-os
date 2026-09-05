import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 8.10 Layer 2: Mark a pending interaction as consumed.
 * 
 * Uses optimistic locking to prevent race conditions: UPDATE only succeeds
 * if consumed is still FALSE. If two simultaneous requests try to consume
 * the same interaction, only the first succeeds.
 * 
 * @param supabase Supabase client
 * @param pendingInteractionId UUID of the pending interaction
 * @throws Error if interaction already consumed or update fails
 */
export async function consumePendingInteraction(
  supabase: SupabaseClient,
  pendingInteractionId: string
): Promise<void> {
  // Optimistic locking: only update if consumed is still FALSE
  const { error, count } = await supabase
    .from("pending_interactions")
    .update({ consumed: true })
    .eq("id", pendingInteractionId)
    .eq("consumed", false);

  if (error) {
    throw new Error(`Failed to consume interaction: ${error.message}`);
  }

  // If count is 0, means it was already consumed (optimistic lock failed)
  if (count === 0) {
    throw new Error("Interaction already consumed");
  }
}
