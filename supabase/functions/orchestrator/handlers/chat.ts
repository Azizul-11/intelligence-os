import type { ChatRequest } from "../types/request.ts";
import type { ChatResponse } from "../types/response.ts";

import { supabase } from "../../shared/supabase.ts";
import { executeRuntime } from "../services/runtime.ts";
import { handleContinuation } from "../services/continuation.ts";
import { isConversational, preflightClarification } from "../services/conversational.ts";
import { findUngroundedNames } from "../services/summary-grounding.ts";
import { createPendingInteraction } from "@intelligence/runtime-engine";
import { getDomainMetrics, getDomainCapabilities, getRuntimeEngine } from "../services/domain-registry.ts";
import { llmGateway, withLlmCallLog } from "@intelligence/llm-model-gateway";

/**
 * LLM Integration Layer 0 (Conversational Front-Door Router). A short
 * greeting/meta-capability/thanks message never reaches Gate 1 semantic
 * resolution at all - live dogfooding (docs/Frontend test/PrePhase 9
 * LLM.md) showed "hi"/"hello"/"what can you do" hitting the deterministic
 * pipeline's own honest "Unable to resolve question." dead end, which is
 * technically correct (none of these are analytical questions) but reads
 * as a compiler failure on a user's very first message. This is a plain
 * regex classifier, not a semantic gate - it never decides whether a
 * REAL analytical question is answerable, only whether a message is
 * conversational enough to skip the pipeline entirely. Batch 1: it now
 * matches the WHOLE utterance (see services/conversational.ts), so a
 * request that merely starts with a greeting reaches the pipeline.
 */

/**
 * Every suggestion chip from Layer 0 must still be dry-run validated
 * exactly like every other suggestion this platform surfaces (the
 * Every-Turn/100%-Executable invariants make no exception for
 * conversational turns) - reuses the same RuntimeRequest.dryRun
 * mechanism create-runtime-engine.ts's own suggestion loop already
 * established, just invoked here since Layer 0 returns before the
 * engine's own suggestion-generation code ever runs.
 */
async function validateConversationalSuggestions(candidates: string[]): Promise<string[]> {
  const engine = getRuntimeEngine();
  const validated: string[] = [];
  for (const candidate of candidates) {
    if (validated.length >= 4) {
      break;
    }
    const trial = await engine.execute({ question: candidate, dryRun: true });
    if (trial.success) {
      validated.push(candidate);
    }
  }
  return validated;
}

/**
 * LLM Integration Layer 3 (Executive Answer Synthesis): the mandatory
 * deterministic guardrail every summary must pass before it can ever
 * reach the user - extracts every standalone numeric token the LLM's
 * summary contains and confirms each one literally appears somewhere in
 * the rows it's summarizing. Never edits/patches a summary that fails
 * this check - it is discarded outright, and the response simply has no
 * `summary` field (its own `answer` field with the raw rows is
 * completely unaffected either way).
 */
function extractNumericTokens(text: string): string[] {
  return text.match(/\d+(\.\d+)?/g) ?? [];
}

function rowsContainNumber(rows: Record<string, unknown>[], token: string): boolean {
  return rows.some((row) =>
    Object.values(row).some((value) => String(value).includes(token)),
  );
}

/**
 * PrePhase 9.5, Guardrail 6: no bare, technical-sounding failure text
 * ever reaches the frontend as a "compiler failure." This only softens
 * the specific, already-catalogued BLUNT/GENERIC messages (the ones
 * this task's own dogfooding flagged - "Unable to resolve question.",
 * "SQL template not found.", the missing-parameter message) - it never
 * touches an already-informative message (Phase 8.10's alternative-
 * based guidance text, F5's negation explanation, a targeted identity-
 * ambiguous clarification), which are handled by their own dedicated
 * branches above this function's only call site and already read as
 * helpful, not as a raw error.
 */
const BLUNT_FAILURE_MESSAGES = new Set([
  "Unable to resolve question.",
  "SQL template not found.",
  "I don't have enough specific information to identify exactly which record this question refers to. Please include more identifying detail (such as a full name or location) and try again.",
  // Bug E (Phase 3.1.1): the exact literal text create-runtime-engine.ts
  // falls back to when QueryPlanner.createPlan() refuses to plan at all
  // (query-planner.ts's own `discoverDefaultRankableMetric` guard,
  // "Unable to create query plan.") - this is the same class of
  // technical-sounding dead end the 3 messages above already exist to
  // soften, just not previously in this set. Fires for the off-topic/
  // unaccounted-token refusal ("what's the weather in Texas?") among
  // other genuinely-nothing-resolved cases - the generic redirect below
  // is honest and appropriate for all of them, same as it already is for
  // "Unable to resolve question."
  "Unable to create query plan.",
]);

function softenBluntFailureMessage(error: string | undefined): string | undefined {
  if (!error || !BLUNT_FAILURE_MESSAGES.has(error)) {
    return error;
  }
  return "I specialize in US hospital clinical performance and healthcare analytics - I couldn't quite match that to something I track. Here are a few things I can help with:";
}

// The summary is decoration: the rows are already the answer. On the free
// chain it took 10-44 s whenever the first tiers were rate-limited (live,
// 2026-09-19), so the whole call gets a hard budget and a late summary is
// simply left out - the same outcome as one the numeric cross-check rejects.
const SUMMARY_DEADLINE_MS = 3500;

async function buildVerifiedSummary(
  question: string,
  rows: Record<string, unknown>[],
): Promise<string | undefined> {
  if (rows.length === 0) {
    return undefined;
  }

  const summary = await llmGateway.summarizeResult(question, rows, SUMMARY_DEADLINE_MS);
  if (!summary) {
    return undefined;
  }

  const numbers = extractNumericTokens(summary);
  const allNumbersVerified = numbers.every((token) => rowsContainNumber(rows, token));
  if (!allNumbersVerified) {
    return undefined;
  }

  // The number check cannot see a hospital that is not in the table (live:
  // "New England Medical Center", "AdventHealth Orlando" passed it).
  const catalog = getDomainCapabilities();
  const ungrounded = findUngroundedNames(summary, question, rows, [
    ...catalog.states,
    ...catalog.ownerships,
    ...catalog.metrics.map((metric) => metric.displayName),
    ...(catalog.concepts ?? []).map((concept) => concept.displayName),
  ]);
  if (ungrounded.length > 0) {
    console.warn("[Summary dropped: names not in the rows]", ungrounded);
    return undefined;
  }

  return summary;
}

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

/**
 * Every response, whichever path produced it, carries how long the server took
 * and every LLM call made for it (role, model that answered, latency) - the
 * frontend renders both, so a slow query can be attributed without log access.
 */
export async function handleChat(
  request: ChatRequest,
): Promise<ChatResponse> {
  const startedAt = Date.now();
  const { result, calls } = await withLlmCallLog(() => runChat(request));
  return {
    ...result,
    metadata: { ...result.metadata, executionTimeMs: Date.now() - startedAt },
    llmCalls: calls,
  };
}

async function runChat(
  request: ChatRequest,
): Promise<ChatResponse> {
  // Phase 8.10 Layer 2: Check if this is a continuation (Turn 2)
  if (request.pendingInteractionId && request.continuationResponse) {
    return await handleContinuation(request);
  }

  // LLM Integration Layer 0: intercepted BEFORE Gate 1 / the deterministic
  // pipeline entirely - never SQL, never the analytical pipeline, purely
  // an onboarding/deflection response. See isConversational()'s own doc
  // comment for why this exists.
  if (isConversational(request.question)) {
    const capabilities = getDomainCapabilities();
    const conversational = await llmGateway.handleConversational(request.question, capabilities);
    const suggestions = await validateConversationalSuggestions(conversational.suggestions);
    return {
      success: true,
      answer: conversational.answer,
      suggestions: suggestions.length > 0 ? suggestions : capabilities.exampleAnswerableQuestions.slice(0, 3),
      answerability: { status: "conversational" },
    };
  }

  // Batch 4: a question that cannot be run as typed (a follow-up with nothing
  // to follow up on, "top 0") is asked about instead, with 0 SQL.
  const preflight = preflightClarification(request.question);

  if (preflight) {
    return {
      success: false,
      answer: preflight,
      error: preflight,
      answerability: { status: "not_directly_answerable" },
      suggestions: getDomainCapabilities().exampleAnswerableQuestions.slice(0, 3),
    };
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
        // city/county/state fields split out accordingly. A hospital-family
        // candidate (Batch 4) leads with the facility name, which may itself
        // contain ", ": the last three parts are the place, the rest the name.
        const offeredOptions = result.answerability.candidates.map((candidate: any) => {
          const parts = (candidate.label || "").split(", ");
          const [city, county, state] = parts.slice(-3);
          const hospitalName = parts.length > 3 ? parts.slice(0, -3).join(", ") : "";

          return {
            facility_id: candidate.value,
            hospital_name: hospitalName, // Only a hospital-family candidate carries it
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
      error: softenBluntFailureMessage(result.error),
      requestId,
      answerability: result.answerability,
      trace: result.trace,
      suggestions: result.suggestions,
    };
  }

  const summary = await buildVerifiedSummary(
    request.question,
    result.rows as Record<string, unknown>[],
  );

  return {
    success: true,
    answer: JSON.stringify(result.rows, null, 2),
    requestId,
    answerability: result.answerability,
    trace: result.trace,
    suggestions: result.suggestions,
    ...(summary ? { summary } : {}),
    metadata: {
      rowCount: result.rowCount,
    },
  };
}