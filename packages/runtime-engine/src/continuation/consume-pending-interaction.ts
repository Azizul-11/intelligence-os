import type { SupabaseClient } from "@supabase/supabase-js";

/** Phase 8.10 Layer 2: marks a pending interaction consumed via optimistic locking (UPDATE only if consumed is still FALSE), so only the first of two simultaneous requests wins; throws if already consumed or the update fails. */
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
