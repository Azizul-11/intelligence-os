import type { ChatRequest } from "../types/request.ts";
import type { ChatResponse } from "../types/response.ts";

import { supabase } from "../../shared/supabase.ts";
import { executeRuntime } from "../services/runtime.ts";
import { handleContinuation } from "../services/continuation.ts";
import { createPendingInteraction } from "@intelligence/runtime-engine";
import { getDomainMetrics } from "../services/domain-registry.ts";

// Tier0 Task 2 (F8) Phase 2: Query Tracer Observability. Persists the
// PhaseGateTracker trace RuntimeResult already carries (see
// packages/runtime-engine/src/phase-gate-tracker.ts) as one row per
// request - purely evidentiary, never read back by the runtime itself to
// make any decision. Fire-and-forget by design (best-effort tracing must
// never fail or slow down the actual answer): logged, not thrown, on
// error.
async function persistTrace(
  requestId: string,
  questionText: string,
  result: { answerability?: { status: string; reason?: string }; trace?: unknown[]; error?: string },
): Promise<void> {
  try {
    const gates = (result.trace ?? []) as { sqlCalls?: number }[];
    const sqlCalls = gates.reduce((sum, gate) => sum + (gate.sqlCalls ?? 0), 0);

    await supabase.from("phase_execution_trace").insert({
      request_id: requestId,
      query_text: questionText,
      answerability_status: result.answerability?.status ?? null,
      sql_calls: sqlCalls,
      gates: result.trace ?? [],
      error_message: result.error ?? null,
    });
  } catch (error) {
    console.error("[Phase trace persistence failed]", error);
  }
}

export async function handleChat(
  request: ChatRequest,
): Promise<ChatResponse> {
  // Phase 8.10 Layer 2: Check if this is a continuation (Turn 2)
  if (request.pendingInteractionId && request.continuationResponse) {
    return await handleContinuation(request);
  }

  const requestId = crypto.randomUUID();

  // Normal execution (Turn 1 or standalone query)
  const result = await executeRuntime(request, requestId);
  await persistTrace(requestId, request.question, result);

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
        // Candidates from runtime are {value: facility_id, label: "CITY, COUNTY County, STATE"}
        // (see entity-provider.ts's toAmbiguousCandidate()) - a fixed
        // 3-part format, not 2-part - so matching needs the individual
        // city/county/state fields split out accordingly.
        const offeredOptions = result.answerability.candidates.map((candidate: any) => {
          const [city, county, state] = (candidate.label || "").split(", ");

          return {
            facility_id: candidate.value,
            hospital_name: "", // Not available in generic candidate
            city: (city || "").trim(),
            county: (county || "").trim(),
            state: (state || "").trim(),
            displayLabel: candidate.label || `${city} - ${state}`,
          };
        });

        // Tier0 Task 6: store the real semantic context this Turn already
        // resolved (metric/concept/etc, never the ambiguous entity itself
        // - see RuntimeResult.semanticMatches's own doc comment) instead
        // of an empty placeholder, so a Layer 2 continuation Turn 2 can
        // tell whether Turn 1 named a specific metric/condition at all.
        const interaction = await createPendingInteraction(supabase, {
          kind: "clarification",
          userId: request.userId,
          originalQuestion: request.question,
          originalSemanticResult: result.semanticMatches ?? [],
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
          requestId,
          answerability: result.answerability,
          trace: result.trace,
          suggestions: result.suggestions,
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
          requestId,
          answerability: result.answerability,
          trace: result.trace,
          suggestions: result.suggestions,
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
      requestId,
      answerability: result.answerability,
      trace: result.trace,
      suggestions: result.suggestions,
    };
  }

  return {
    success: true,
    answer: JSON.stringify(result.rows, null, 2),
    requestId,
    answerability: result.answerability,
    trace: result.trace,
    suggestions: result.suggestions,
    metadata: {
      rowCount: result.rowCount,
    },
  };
}