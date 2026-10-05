/** Handles Turn-2 continuation: matches the user's reply against a pending clarification/guidance, reconstructs the request, and re-executes through the full RuntimeEngine pipeline. */
import { supabase } from "../../shared/supabase.ts";
import { describeResultNote, getRuntimeEngine, lookupHospitalOverallRating } from "./domain-registry.ts";
// Used only for the narrow bypass paths below that call lookupHospitalOverallRating() directly or terminate before engine.execute().
import { SAFE_FALLBACK_SUGGESTIONS } from "@intelligence/healthcare-domain";

import { continuationQuestion } from "./continuation-question.ts";
import { buildVerifiedSummary, recordRejectedSummary } from "./verified-summary.ts";
import { composeSummary } from "./graceful-message.ts";

import type { ChatRequest } from "../types/request.ts";
import type { ChatResponse } from "../types/response.ts";

import {
  retrievePendingInteraction,
  consumePendingInteraction,
  matchClarificationResponse,
  matchClarificationPair,
  matchGuidanceResponse,
  reconstructClarificationRequest,
  reconstructGuidanceRequest,
  reconstructHospitalChoice,
} from "@intelligence/runtime-engine";

/** Whether Turn 1 named a specific metric/condition - shared by the geographic-clarification and F8 "own" branches to decide if a generic overall_rating fallback is safe. */
function hadMetricOrConcept(originalSemanticResult: unknown): boolean {
  return (
    Array.isArray(originalSemanticResult) &&
    originalSemanticResult.some(
      (match: any) => match?.semanticType === "metric" || match?.semanticType === "concept",
    )
  );
}

// Mirrors query-intent-detector.ts's COMPARISON_KEYWORDS - can't import a Node package's internal const across the Deno edge boundary.
const COMPARISON_KEYWORDS = ["compare", "vs", "versus"];

function hasComparisonKeyword(question: string): boolean {
  const words = question.toLowerCase().split(/\s+/);
  return COMPARISON_KEYWORDS.some((keyword) => words.includes(keyword));
}

/** Whether Turn 1 was a multi-entity comparison ("compare memorial hospital vs ANIMAS"): checks the question text for a comparison keyword plus one resolved entity,
 * because counting `comparable` entities never reaches 2 (the ambiguous one is excluded and EntityDefinition has no `comparable`). */
function wasComparisonQuery(originalQuestion: string, originalSemanticResult: unknown): boolean {
  if (!hasComparisonKeyword(originalQuestion) || !Array.isArray(originalSemanticResult)) {
    return false;
  }

  return originalSemanticResult.some(
    (match: any) => match?.semanticType === "entity" && match?.resolvedValue !== undefined,
  );
}

/** Continuation handling: retrieve pending interaction, match the response, reconstruct the request, consume, then re-execute through the full RuntimeEngine pipeline. */
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
      forcedIdentityCandidate?: { value: unknown };
      selectedCapability?: string;
      identityAlreadyResolved?: boolean;
      forcedIntent?: "lookup" | "ranking" | "comparison";
      companionEntities?: Array<{ value: unknown; canonicalKey: string }>;
    } | null = null;

    if (interaction.kind === "clarification") {
      let selectedOption = matchClarificationResponse(
        request.continuationResponse!,
        interaction.offeredOptions as any[]
      );

      // Batch 4: a comparison has two slots, and one reply may fill both
      // ("ABILENE and GONZALES"). The second option joins as a companion below.
      let secondOption: any = null;

      if (!selectedOption && hasComparisonKeyword(interaction.originalQuestion)) {
        const pair = matchClarificationPair(
          request.continuationResponse!,
          interaction.offeredOptions as any[]
        );

        if (pair) {
          [selectedOption, secondOption] = pair;
        }
      }

      if (!selectedOption) {
        return {
          success: false,
          answer: "",
          error:
            "I couldn't match your response to one of the offered options. Please try again or be more specific.",
          suggestions: SAFE_FALLBACK_SUGGESTIONS.slice(),
        };
      }

      // Tier0 Task 2 (F8): the hospital-ranking clarification (lookup vs similar) doesn't share the geographic
      // case's "append a qualifier" shape - handled separately before falling through to it.
      const hospitalChoice = reconstructHospitalChoice(selectedOption);

      if (hospitalChoice?.kind === "guidance") {
        await consumePendingInteraction(supabase, interaction.id);

        // Frontend bug fix: this is a terminal message (no pendingInteractionId), so QueryConsole.tsx only renders
        // `error`, never `answer` - populate both so the guidance text reaches the user.
        return {
          success: false,
          answer: hospitalChoice.message,
          error: hospitalChoice.message,
          suggestions: SAFE_FALLBACK_SUGGESTIONS.slice(),
        };
      }

      if (hospitalChoice?.kind === "lookup") {
        await consumePendingInteraction(supabase, interaction.id);

        // Tier0 Task 6 (F8): Turn 1 named a specific metric/condition, so re-execute the ORIGINAL question with the identity forced
        // and `forcedIntent: "lookup"` ("best" would otherwise route to a population-wide ranking; the bare overall-rating lookup below would substitute a generic rating).
        if (hadMetricOrConcept(interaction.originalSemanticResult)) {
          const requestId = crypto.randomUUID();
          const engine = getRuntimeEngine();
          const conditionResult = await engine.execute({
            question: interaction.originalQuestion,
            parameters: {},
            requestId,
            identityAlreadyResolved: true,
            forcedIdentityCandidate: { value: hospitalChoice.facilityId },
            forcedIntent: "lookup",
            // Tier1 Task 6: a real Turn 2 terminal response - see
            // RuntimeRequest.includeSuggestions's own doc comment.
            includeSuggestions: true,
          });

          if (conditionResult.success) {
            return {
              success: true,
              requestId,
              answerability: conditionResult.answerability,
              trace: conditionResult.trace,
              answer: JSON.stringify(conditionResult.rows, null, 2),
              metadata: { rowCount: conditionResult.rowCount },
              suggestions: conditionResult.suggestions,
            };
          }
          // Falls through to the bare overall-rating lookup only if the condition-aware re-execution itself failed.
        }

        // Deliberately bypasses the NL pipeline - see reconstruct-hospital-choice.ts for why re-typing the
        // hospital's own name isn't safe to re-resolve. Queries hospital-overall-rating directly by facility_id.
        const lookupResult = await lookupHospitalOverallRating(hospitalChoice.facilityId);

        if (!lookupResult.success) {
          return {
            success: false,
            answer: "",
            error: lookupResult.error ?? "Lookup failed",
            suggestions: SAFE_FALLBACK_SUGGESTIONS.slice(),
          };
        }

        return {
          success: true,
          answer: JSON.stringify(lookupResult.rows, null, 2),
          metadata: { rowCount: lookupResult.rowCount },
          suggestions: SAFE_FALLBACK_SUGGESTIONS.slice(),
        };
      } else {
        // Reconstruct clarification request
        const reconResult = reconstructClarificationRequest(interaction, selectedOption);

        // Comparison continuation fix: preserve comparison intent in Turn 2 so metric injection doesn't overwrite it with bare lookup.
        const isComparisonTurn2 =
          Boolean(secondOption) || wasComparisonQuery(interaction.originalQuestion, interaction.originalSemanticResult);
        const forcedIntentForTurn2 = isComparisonTurn2 ? "comparison" : undefined;

        // Bug fix: a Turn 1 comparison with 2+ entities must preserve ALL entities in Turn 2, not just the
        // disambiguated one - extracted and passed through so ExecutionPlanMapper builds a multi-entity IN filter.
        let companionEntities: Array<{ value: unknown; canonicalKey: string }> = [];

        if (wasComparisonQuery(interaction.originalQuestion, interaction.originalSemanticResult)) {
          const originalEntities = Array.isArray(interaction.originalSemanticResult)
            ? interaction.originalSemanticResult.filter(
                (match: any) => match?.semanticType === "entity" && match?.resolvedValue
              )
            : [];

          // Companions are entities NOT in the ambiguity being resolved (that one is injected via forcedIdentityCandidate).
          const ambiguousCandidateValues = new Set(
            (interaction.pendingTarget?.candidates ?? []).map((c: any) => c.value)
          );
          
          companionEntities = originalEntities
            .filter((entity: any) => !ambiguousCandidateValues.has(entity.resolvedValue)) // already unambiguously resolved in Turn 1
            .map((entity: any) => ({
              value: entity.resolvedValue,
              canonicalKey: entity.canonicalKey,
            }));
        }

        if (secondOption) {
          companionEntities.push({ value: secondOption.facility_id, canonicalKey: "hospital" });
        }

        reconstructed = {
          // "Northwest Medical Center" → "Northwest Medical Center in Tucson, AZ";
          // a comparison of hospitals appends nothing (see continuation-question.ts).
          question: continuationQuestion(interaction.originalQuestion, selectedOption, {
            isComparison: isComparisonTurn2,
            twoSlot: Boolean(secondOption),
          }),
          forcedCandidate: selectedOption,
          // Tier0 Task 6: passes Turn 1's already-resolved candidate through as a structural identity injection, so
          // a re-triggered ambiguity on the reconstructed text resolves by the known value instead of falling through.
          forcedIdentityCandidate: { value: (reconResult.forcedIdentity as any)?.facility_id },
          // Frontend bug fix: this Turn 2 already resolved the identity - must terminate, not chain into a further plan-ambiguity clarification about it.
          identityAlreadyResolved: true,
          forcedIntent: forcedIntentForTurn2,
          companionEntities: companionEntities.length > 0 ? companionEntities : undefined,
        };
      }
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
          suggestions: SAFE_FALLBACK_SUGGESTIONS.slice(),
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
        suggestions: SAFE_FALLBACK_SUGGESTIONS.slice(),
      };
    }

    // 3. Mark interaction as consumed (one-time use, replay prevention)
    await consumePendingInteraction(supabase, interaction.id);

    // 4. Execute reconstructed request through full RuntimeEngine pipeline
    // CRITICAL: Full revalidation - no shortcuts, no stale ExecutionPlan
    const requestId = crypto.randomUUID();
    const engine = getRuntimeEngine();
    const result = await engine.execute({
      question: reconstructed.question,
      parameters: {}, // Simplified - full semantic context not passed yet
      requestId,
      identityAlreadyResolved: reconstructed.identityAlreadyResolved,
      forcedIdentityCandidate: reconstructed.forcedIdentityCandidate,
      forcedIntent: reconstructed.forcedIntent,
      companionEntities: reconstructed.companionEntities,
      // Tier1 Task 6: a real Turn 2 terminal response - see
      // RuntimeRequest.includeSuggestions's own doc comment.
      includeSuggestions: true,
    });

    // Tier0 Task 2 (F8) Phase 2: same evidentiary trace persistence as
    // chat.ts's Turn 1 path - Turn 2's re-execution goes through the
    // exact same gated pipeline (see runPipeline() in
    // create-runtime-engine.ts), so it gets the same trace.
    try {
      const gates = (result.trace ?? []) as { sqlCalls?: number }[];
      await supabase.from("phase_execution_trace").insert({
        request_id: requestId,
        query_text: reconstructed.question,
        answerability_status: result.answerability?.status ?? null,
        sql_calls: gates.reduce((sum, gate) => sum + (gate.sqlCalls ?? 0), 0),
        gates: result.trace ?? [],
        error_message: result.error ?? null,
      });
    } catch (error) {
      console.error("[Phase trace persistence failed]", error);
    }

    if (!result.success) {
      // Frontend bug fix: a resolved identity + ranking-worded question can still hit Phase 8.8's rank/single-entity
      // refusal - identityAlreadyResolved only prevents a second clarification, not which template "rank" selects.
      // Falls back to a direct overall-rating lookup only when the natural reconstruction itself failed.
      // Tier0 Task 6: this fallback can only ever return a generic overall_rating, never a condition-specific
      // measure - checked against Turn 1's semantic context so it never substitutes for a named metric/condition.
      const facilityId = reconstructed.forcedCandidate?.facility_id;

      if (
        typeof facilityId === "string" &&
        reconstructed.identityAlreadyResolved &&
        !hadMetricOrConcept(interaction.originalSemanticResult)
      ) {
        const fallback = await lookupHospitalOverallRating(facilityId);

        if (fallback.success) {
          return {
            success: true,
            answer: JSON.stringify(fallback.rows, null, 2),
            requestId,
            answerability: { status: "answerable" },
            metadata: { rowCount: fallback.rowCount },
            suggestions: SAFE_FALLBACK_SUGGESTIONS.slice(),
          };
        }
      }

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

    // Batch E: an empty Turn 2 answer gets the same one-line explanation as an empty Turn 1 answer, not a blank table.
    const executedParameters = (result as { executedParameters?: Record<string, unknown> }).executedParameters;
    const note = result.rows.length === 0 ? await describeResultNote([], executedParameters) : undefined;

    // Post-clarification summary fix: a Turn 2 answer never called the summarizer - mirrors chat.ts's Turn 1 path
    // exactly, so a clarified answer reads the same way. A rejected summary is recorded the same way too.
    const verified = await buildVerifiedSummary(reconstructed.question, result.rows as Record<string, unknown>[], executedParameters, note ? [note] : []).catch(
      () => ({}) as Awaited<ReturnType<typeof buildVerifiedSummary>>,
    );
    const summary = composeSummary(note, verified.summary);

    if (verified.rejected) {
      await recordRejectedSummary(requestId, result.trace, verified.rejected);
    }

    return {
      success: true,
      requestId,
      answerability: result.answerability,
      trace: result.trace,
      answer: JSON.stringify(result.rows, null, 2),
      ...(summary ? { summary } : {}),
      metadata: {
        rowCount: result.rowCount,
        ...(verified.rejected ? { summaryRejected: verified.rejected } : {}),
      },
      suggestions: result.suggestions,
    };
  } catch (error) {
    console.error("[Continuation Error]", error);
    return {
      success: false,
      answer: "",
      error: error instanceof Error ? error.message : "Continuation failed",
      suggestions: SAFE_FALLBACK_SUGGESTIONS.slice(),
    };
  }
}
