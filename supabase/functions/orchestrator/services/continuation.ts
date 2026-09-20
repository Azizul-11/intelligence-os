import { supabase } from "../../shared/supabase.ts";
import { getRuntimeEngine, lookupHospitalOverallRating } from "./domain-registry.ts";
// Tier1 Task 6: the 3 guaranteed-safe, already-verified-working starter
// queries - used only for the narrow bypass paths below that call
// lookupHospitalOverallRating() directly (raw SqlExecutor result, never
// routed through create-runtime-engine.ts's own dry-run-validated
// suggestion generation) or that terminate before any engine.execute()
// call at all. Every other return here forwards real, dry-run-validated
// suggestions from an actual engine.execute() result.
import { SAFE_FALLBACK_SUGGESTIONS } from "@intelligence/healthcare-domain";

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

/**
 * Tier0 Task 6: whether Turn 1 named a specific metric/condition at all
 * (e.g. "mortality-rate" + "acute-myocardial-infarction" for "...mortality
 * rate for heart attack specifically?" or "...best AMI mortality") - read
 * from `PendingInteraction.originalSemanticResult`, which (since the Task 6
 * fix) holds the real semantic matches Turn 1 resolved, not a placeholder.
 * Shared by both the geographic-clarification branch and the F8 "own"
 * branch below, since both need the same answer to the same question:
 * "is a generic overall_rating fallback safe here, or would it silently
 * substitute for a condition the user actually asked about?"
 */
function hadMetricOrConcept(originalSemanticResult: unknown): boolean {
  return (
    Array.isArray(originalSemanticResult) &&
    originalSemanticResult.some(
      (match: any) => match?.semanticType === "metric" || match?.semanticType === "concept",
    )
  );
}

// Mirrors packages/query-planner/src/query-intent-detector.ts's own
// COMPARISON_KEYWORDS exactly - a tiny, stable set, mirrored rather than
// imported since this Deno edge function can't easily pull a Node
// package's internal (non-exported) const across the runtime boundary
// (the same pattern chat.ts's own CONVERSATIONAL_PATTERNS already uses).
const COMPARISON_KEYWORDS = ["compare", "vs", "versus"];

/**
 * Comparison continuation fix: whether Turn 1 was a multi-entity
 * comparison query (e.g. "compare memorial hospital vs ANIMAS").
 *
 * BUG FOUND live (2026-09-15): the original version of this check
 * counted `comparable` entities inside `originalSemanticResult` (i.e.
 * `RuntimeResult.semanticMatches`) and required 2+. But
 * `semanticMatches` is populated with the entities ALREADY resolved
 * alongside an ambiguity - by design, it deliberately EXCLUDES the
 * ambiguous entity mention itself (see chat.ts's own doc comment on
 * `originalSemanticResult`). So for "compare memorial hospital vs Mayo
 * Clinic" (memorial hospital ambiguous, Mayo Clinic resolved), only ONE
 * comparable entity (Mayo Clinic) could ever appear here - the count
 * could never reach 2 for exactly the shape this function exists to
 * detect, silently disabling the whole comparison-continuation fix.
 *
 * Fixed by checking the ORIGINAL QUESTION TEXT for a comparison
 * keyword instead (the same signal `QueryIntentDetector` itself uses
 * to classify comparison intent in the first place) - combined with
 * requiring at least one already-resolved ENTITY (any entity, not
 * "comparable" - `EntityDefinition` has no `comparable` field at all;
 * that flag only ever exists on `MetricDefinition`. The original
 * check's `.definition?.comparable === true` was checking a property
 * that can never be true for an entity, so it silently disabled this
 * function a SECOND, independent way even after the keyword fix -
 * confirmed live by reading the actual persisted
 * `pending_interactions.original_semantic_result` row: the entity's
 * serialized `definition` has no `comparable` key at all) - to avoid
 * misfiring on an unrelated "compare" mention with no pending
 * multi-entity identity at all.
 */
function hasComparisonKeyword(question: string): boolean {
  const words = question.toLowerCase().split(/\s+/);
  return COMPARISON_KEYWORDS.some((keyword) => words.includes(keyword));
}

function wasComparisonQuery(originalQuestion: string, originalSemanticResult: unknown): boolean {
  if (!hasComparisonKeyword(originalQuestion) || !Array.isArray(originalSemanticResult)) {
    return false;
  }

  return originalSemanticResult.some(
    (match: any) => match?.semanticType === "entity" && match?.resolvedValue !== undefined,
  );
}

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

      // Tier0 Task 2 (F8): the hospital-ranking clarification ("Mayo
      // Clinic best hospitals" → lookup vs similar) doesn't share the
      // geographic case's "append a location qualifier" shape - checked
      // first, and handled entirely separately, before falling through
      // to the unchanged geographic reconstruction below.
      const hospitalChoice = reconstructHospitalChoice(selectedOption);

      if (hospitalChoice?.kind === "guidance") {
        await consumePendingInteraction(supabase, interaction.id);

        // Frontend bug fix: this response has no pendingInteractionId (it's
        // a terminal message, not a further continuation), so
        // QueryConsole.tsx classifies it as a plain error and only ever
        // renders `error`, never `answer`, for that case - populate both
        // so the helpful guidance text actually reaches the user instead
        // of the generic "no error message" fallback.
        return {
          success: false,
          answer: hospitalChoice.message,
          error: hospitalChoice.message,
          suggestions: SAFE_FALLBACK_SUGGESTIONS.slice(),
        };
      }

      if (hospitalChoice?.kind === "lookup") {
        await consumePendingInteraction(supabase, interaction.id);

        // Tier0 Task 6 (F8 own-choice extension): Turn 1 named a specific
        // metric/condition (e.g. "Mayo Clinic best AMI mortality") - the
        // bare overall-rating lookup below would silently substitute a
        // generic rating for the condition the user actually asked about,
        // the same silent-wrong shape Task 6's own fix already closed for
        // the geographic-clarification branch. Re-execute the ORIGINAL
        // Turn 1 question (still names the resolved metric/concept in its
        // own text) through the full RuntimeEngine pipeline, with the
        // identity structurally forced (the hospital is already
        // unambiguous here - `forcedIdentityCandidate` is a safe no-op if
        // no matching ambiguity exists) and `forcedIntent: "lookup"` so
        // the no-longer-meaningful ranking word ("best") doesn't route
        // this to a population-wide ranking template that has no
        // parameter for this one already-known facility.
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
          // Falls through to the bare overall-rating lookup below only if
          // the condition-aware re-execution itself failed - the same
          // last-resort-fallback shape the geographic branch already uses.
        }

        // Deliberately bypasses the NL pipeline entirely - see
        // reconstruct-hospital-choice.ts for why re-typing the hospital's
        // own name is not safe to re-resolve. Queries the existing
        // hospital-overall-rating template directly by the already-known
        // facility_id. Reached directly (no metric/condition was ever
        // named) or as a last-resort fallback (condition-aware
        // re-execution above failed for some other reason).
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

        // For clarification, reconstruct by appending explicit location qualifier
        // "Northwest Medical Center" → "Northwest Medical Center in Tucson, AZ"
        // This makes the mention unambiguous for re-resolution
        // A two-slot reply names two places, so nothing is appended: both
        // facilities are injected by identity instead (see the companion below).
        const locationQualifier = secondOption
          ? ""
          : [selectedOption.city, selectedOption.state].filter(Boolean).join(", ");

        // Comparison continuation fix: if Turn 1 was a comparison query
        // (2+ comparable entities), preserve comparison intent in Turn 2
        // so metric injection doesn't overwrite it with bare lookup metric.
        const forcedIntentForTurn2 =
          secondOption || wasComparisonQuery(interaction.originalQuestion, interaction.originalSemanticResult)
            ? "comparison"
            : undefined;

        // Bug fix: Multi-entity continuation (comparison with one ambiguous entity).
        // When Turn 1 had 2+ entities (e.g., "compare memorial hospital vs ANIMAS"),
        // Turn 2 must preserve ALL entities, not just the disambiguated one.
        // Extract companion entities (non-ambiguous entities from Turn 1) and pass
        // them through so ExecutionPlanMapper builds multi-entity IN filter.
        let companionEntities: Array<{ value: unknown; canonicalKey: string }> = [];
        
        if (wasComparisonQuery(interaction.originalQuestion, interaction.originalSemanticResult)) {
          const originalEntities = Array.isArray(interaction.originalSemanticResult)
            ? interaction.originalSemanticResult.filter(
                (match: any) => match?.semanticType === "entity" && match?.resolvedValue
              )
            : [];
          
          // Companion entities are those NOT involved in the ambiguity being resolved.
          // The disambiguated entity will be injected separately via forcedIdentityCandidate.
          // We identify the ambiguous entity by checking if its resolvedValue matches any
          // of the offered candidates' values (the ambiguity involves these candidates).
          const ambiguousCandidateValues = new Set(
            (interaction.pendingTarget?.candidates ?? []).map((c: any) => c.value)
          );
          
          companionEntities = originalEntities
            .filter((entity: any) => {
              // Keep entities whose resolvedValue is NOT in the ambiguity candidates
              // This means they were already unambiguously resolved in Turn 1
              return !ambiguousCandidateValues.has(entity.resolvedValue);
            })
            .map((entity: any) => ({
              value: entity.resolvedValue,
              canonicalKey: entity.canonicalKey,
            }));
        }

        if (secondOption) {
          companionEntities.push({ value: secondOption.facility_id, canonicalKey: "hospital" });
        }

        reconstructed = {
          question: locationQualifier
            ? `${interaction.originalQuestion} in ${locationQualifier}`
            : interaction.originalQuestion,
          forcedCandidate: selectedOption,
          // Tier0 Task 6: `reconResult.forcedIdentity` (until now computed
          // and never used) IS `selectedOption` - Turn 1's own already-
          // resolved candidate. Passed through as a structural identity
          // injection (see RuntimeRequest.forcedIdentityCandidate) so a
          // re-triggered ambiguity on this reconstructed text (e.g. the
          // appended qualifier above isn't adjacent enough to narrow the
          // mention under EntityProvider's contiguity rule) is resolved
          // by the already-known value instead of silently falling
          // through to the generic overall-rating fallback below.
          forcedIdentityCandidate: { value: (reconResult.forcedIdentity as any)?.facility_id },
          // Frontend bug fix: this Turn 2 already resolved exactly which
          // identity the user meant (that's what `selectedOption` IS) -
          // it must terminate, not chain into a further plan-ambiguity
          // clarification (e.g. Tier0 Task 2's own hospital-ranking
          // check) about that same, already-resolved identity.
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
      // Frontend bug fix: a resolved single-hospital identity (this
      // Turn 2 pinned down exactly which facility) combined with a
      // ranking-worded original question ("best hospital for X") can
      // still hit Phase 8.8's pre-existing rank/single-entity
      // incompatible-filter refusal - identityAlreadyResolved only
      // prevents a SECOND ambiguity clarification, it doesn't change
      // which template a "rank" operation selects. Rather than guess
      // the originally-intended metric, fall back to a direct lookup of
      // that exact facility's own overall rating - the same mechanism
      // Tier0 Task 2's F8 "lookup" choice already uses - only when the
      // natural reconstruction itself failed; an already-successful
      // reconstruction (e.g. a plain, non-ranking metric question) is
      // never second-guessed.
      //
      // Tier0 Task 6: this fallback can only ever return a facility's
      // generic overall_rating (see lookupHospitalOverallRating's own
      // doc comment) - never a condition-specific measure. Turn 1's
      // preserved semantic context (originalSemanticResult, now the
      // real matches Turn 1 resolved - see chat.ts) is checked so this
      // never silently substitutes overall_rating for a Turn 1 that
      // actually named a specific metric/condition; it remains
      // available exactly as before for a genuinely bare identity
      // clarification (no metric/concept named at all).
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

    return {
      success: true,
      requestId,
      answerability: result.answerability,
      trace: result.trace,
      answer: JSON.stringify(result.rows, null, 2),
      metadata: {
        rowCount: result.rowCount,
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
