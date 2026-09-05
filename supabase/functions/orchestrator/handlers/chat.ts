import type { ChatRequest } from "../types/request.ts";
import type { ChatResponse } from "../types/response.ts";

import { supabase } from "../../shared/supabase.ts";
import { executeRuntime } from "../services/runtime.ts";
import { handleContinuation } from "../services/continuation.ts";
import { createPendingInteraction } from "@intelligence/runtime-engine";
import { getDomainMetrics } from "../services/domain-registry.ts";

export async function handleChat(
  request: ChatRequest,
): Promise<ChatResponse> {
  // Phase 8.10 Layer 2: Check if this is a continuation (Turn 2)
  if (request.pendingInteractionId && request.continuationResponse) {
    return await handleContinuation(request);
  }

  // Normal execution (Turn 1 or standalone query)
  const result = await executeRuntime(request);

  // Phase 8.10 Layer 2 Task 1: Automatic Turn 1 pending interaction creation
  if (!result.success && result.answerability) {
    // CLARIFICATION: Identity ambiguous
    if (
      result.answerability.status === "ambiguous" &&
      result.answerability.reason === "identity-ambiguous" &&
      result.answerability.candidates &&
      result.answerability.candidates.length > 0
    ) {
      try {
        // Phase 8.10 Layer 2: Enrich candidates with full hospital records
        // Candidates from runtime are {value: facility_id, label: "CITY, STATE"}
        // But matching needs full records with individual fields
        const offeredOptions = result.answerability.candidates.map((candidate: any) => {
          // Parse the label to extract city and state
          const labelParts = (candidate.label || "").split(", ");
          const city = labelParts[0] || "";
          const state = labelParts[1] || "";
          
          return {
            facility_id: candidate.value,
            hospital_name: "", // Not available in generic candidate
            city: city.trim(),
            state: state.trim(),
            displayLabel: candidate.label || `${city} - ${state}`,
          };
        });

        const interaction = await createPendingInteraction(supabase, {
          kind: "clarification",
          userId: request.userId,
          originalQuestion: request.question,
          originalSemanticResult: {}, // Simplified - full context not available yet
          pendingTarget: {
            entityMention: request.question, // Simplified
            candidates: result.answerability.candidates,
          },
          offeredOptions,
        });

        return {
          success: false,
          answer: result.error || "",
          pendingInteractionId: interaction.id,
          interactionKind: "clarification",
        };
      } catch (error) {
        console.error("[Failed to create clarification interaction]", error);
        // Fall through to normal error response
      }
    }

    // GUIDANCE: Capability unavailable
    if (
      result.answerability.status === "not_directly_answerable" &&
      result.answerability.reason === "capability-unavailable" &&
      result.answerability.alternatives &&
      result.answerability.alternatives.length > 0
    ) {
      try {
        // Get domain metrics to resolve display names from domain-owned metadata
        const domainMetrics = getDomainMetrics();

        const offeredOptions = result.answerability.alternatives.map((alt: any) => {
          // Find the metric definition by ID
          const metricDef = domainMetrics.find((m: any) => m.id === alt.capabilityId);
          const displayName = metricDef?.displayName || alt.capabilityId;
          return {
            capabilityId: alt.capabilityId,
            displayName,
          };
        });

        const interaction = await createPendingInteraction(supabase, {
          kind: "guidance",
          userId: request.userId,
          originalQuestion: request.question,
          originalSemanticResult: {}, // Simplified
          pendingTarget: {
            unavailableCapabilityId: "", // Simplified
            requestedOperation: "", // Simplified
            scope: {},
          },
          offeredOptions,
        });

        return {
          success: false,
          answer: result.error || "",
          pendingInteractionId: interaction.id,
          interactionKind: "guidance",
        };
      } catch (error) {
        console.error("[Failed to create guidance interaction]", error);
        // Fall through to normal error response
      }
    }
  }

  if (!result.success) {
    return {
      success: false,
      answer: "",
      error: result.error,
    };
  }

  return {
    success: true,
    answer: JSON.stringify(result.rows, null, 2),
    metadata: {
      rowCount: result.rowCount,
    },
  };
}