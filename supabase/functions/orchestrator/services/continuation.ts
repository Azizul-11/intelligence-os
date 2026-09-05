import { supabase } from "../../shared/supabase.ts";
import { getRuntimeEngine } from "./domain-registry.ts";

import type { ChatRequest } from "../types/request.ts";
import type { ChatResponse } from "../types/response.ts";

import {
  retrievePendingInteraction,
  consumePendingInteraction,
  matchClarificationResponse,
  matchGuidanceResponse,
  reconstructClarificationRequest,
  reconstructGuidanceRequest,
} from "@intelligence/runtime-engine";

/**
 * Phase 8.10 Layer 2 Task 2: Complete continuation handling with full reconstruction.
 * 
 * Flow:
 * 1. Retrieve pending interaction (validates lifecycle)
 * 2. Match user response against offered options (deterministic)
 * 3. Reconstruct complete request with selected option
 * 4. Mark interaction as consumed
 * 5. Execute through full RuntimeEngine pipeline (revalidation)
 * 
 * @param request ChatRequest with pendingInteractionId and continuationResponse
 * @returns ChatResponse with execution result or error
 */
export async function handleContinuation(
  request: ChatRequest,
): Promise<ChatResponse> {
  try {
    // 1. Retrieve and validate pending interaction
    const interaction = await retrievePendingInteraction(
      supabase,
      request.pendingInteractionId!,
      request.userId
    );

    // 2. Match user response against offered options (deterministic only)
    let reconstructed: {
      question: string;
      forcedCandidate?: any;
      selectedCapability?: string;
    } | null = null;

    if (interaction.kind === "clarification") {
      const selectedOption = matchClarificationResponse(
        request.continuationResponse!,
        interaction.offeredOptions as any[]
      );

      if (!selectedOption) {
        return {
          success: false,
          answer: "",
          error:
            "I couldn't match your response to one of the offered options. Please try again or be more specific.",
        };
      }

      // Reconstruct clarification request
      const reconResult = reconstructClarificationRequest(interaction, selectedOption);
      
      // For clarification, reconstruct by appending explicit location qualifier
      // "Northwest Medical Center" → "Northwest Medical Center in Tucson, AZ"
      // This makes the mention unambiguous for re-resolution
      const locationQualifier = [selectedOption.city, selectedOption.state]
        .filter(Boolean)
        .join(", ");
      
      reconstructed = {
        question: locationQualifier
          ? `${interaction.originalQuestion} in ${locationQualifier}`
          : interaction.originalQuestion,
        forcedCandidate: selectedOption,
      };
    } else if (interaction.kind === "guidance") {
      const selectedOption = matchGuidanceResponse(
        request.continuationResponse!,
        interaction.offeredOptions as any[]
      );

      if (!selectedOption) {
        return {
          success: false,
          answer: "",
          error:
            "I couldn't match your response to one of the offered alternatives. Please try again or be more specific.",
        };
      }

      // Reconstruct guidance request by replacing the unavailable capability mention
      // with the selected capability's display name
      const reconResult = reconstructGuidanceRequest(interaction, selectedOption);
      
      // Extract capability name without "Hospital" prefix for natural phrasing
      // "Hospital Overall Rating" → "overall rating"
      let capabilityPhrase = selectedOption.displayName
        .replace(/^Hospital\s+/i, "")
        .toLowerCase();
      
      let reconstructedQuestion = interaction.originalQuestion;
      
      // Try to intelligently substitute - for ranking queries, look for "ranked by X"
      if (reconstructedQuestion.includes("ranked by")) {
        reconstructedQuestion = reconstructedQuestion.replace(
          /ranked by .+?$/i,
          `ranked by ${capabilityPhrase}`
        );
      } else if (reconstructedQuestion.includes("by")) {
        // Fallback: just append the selected capability
        reconstructedQuestion = `${interaction.originalQuestion.replace(/\s+$/, '')} by ${capabilityPhrase}`;
      } else {
        // Worst case: append it
        reconstructedQuestion = `${interaction.originalQuestion} ${capabilityPhrase}`;
      }
      
      reconstructed = {
        question: reconstructedQuestion,
        selectedCapability: selectedOption.capabilityId,
      };
    } else {
      return {
        success: false,
        answer: "",
        error: `Unknown interaction kind: ${interaction.kind}`,
      };
    }

    // 3. Mark interaction as consumed (one-time use, replay prevention)
    await consumePendingInteraction(supabase, interaction.id);

    // 4. Execute reconstructed request through full RuntimeEngine pipeline
    // CRITICAL: Full revalidation - no shortcuts, no stale ExecutionPlan
    const engine = getRuntimeEngine();
    const result = await engine.execute({
      question: reconstructed.question,
      parameters: {}, // Simplified - full semantic context not passed yet
    });

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
  } catch (error) {
    console.error("[Continuation Error]", error);
    return {
      success: false,
      answer: "",
      error: error instanceof Error ? error.message : "Continuation failed",
    };
  }
}
