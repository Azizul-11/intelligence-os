import type { ChatRequest } from "../types/request.ts";
import type { ChatResponse } from "../types/response.ts";

import { supabase } from "../../shared/supabase.ts";
import { executeRuntime } from "../services/runtime.ts";
import { handleContinuation } from "../services/continuation.ts";
import { isConversational, preflightClarification } from "../services/conversational.ts";
import { findUngroundedNames, mentionsIdentifier } from "../services/summary-grounding.ts";
import { createPendingInteraction } from "@intelligence/runtime-engine";
import { getDomainMetrics, getDomainCapabilities, getRuntimeEngine, describeResultNote } from "../services/domain-registry.ts";
import { buildIgnoredNote, buildInterpretedRefusal, buildScopeMessage, buildUnaccountedMessage, composeSummary, droppedTerms, gateAlternates } from "../services/graceful-message.ts";
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

  const summary = await llmGateway.summarizeResult(question, rows, SUMMARY_DEADLINE_MS, getDomainCapabilities().prompts);
  if (!summary) {
    return undefined;
  }

  if (mentionsIdentifier(summary)) {
    console.warn("[Summary dropped: a column name or code in the text]");
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

type TraceGate = { phase: string; status: string; detail?: Record<string, unknown> };

/** The last trace entry of a phase (the tracker records an "enter" first and the outcome after it). */
function lastGate(trace: unknown, phase: string): TraceGate | undefined {
  return [...((trace as TraceGate[] | undefined) ?? [])].reverse().find((gate) => gate.phase === phase);
}

/**
 * Batch 5A-1: a refusal that names what it could not do. A question the domain declined as unsupported ("stroke",
 * "church owned") or one the pipeline refused rather than drop words from ("quiet environment") gets a reply that says
 * what was understood and what is tracked, instead of the static "I specialize in ..." card. The tappable questions
 * come with it as `suggestions` (the domain's guidance, validated by the engine).
 */
function gracefulFailureMessage(trace: unknown): string | undefined {
  const capabilities = getDomainCapabilities();
  const declined = lastGate(trace, "llm-normalization");

  if (declined?.status === "unsupported" && typeof declined.detail?.unsupportedTerms === "string") {
    return buildScopeMessage(declined.detail.unsupportedTerms.split("; "), capabilities.scopeGuidance ?? [], capabilities.coverageSummary);
  }

  const guard = lastGate(trace, "unaccounted-word-guard");

  if (guard?.status === "refused" && typeof guard.detail?.unaccountedWords === "string") {
    return buildUnaccountedMessage(guard.detail.unaccountedWords.split(" "), capabilities.coverageSummary);
  }

  return undefined;
}

/**
 * Batch 5A-1: the one-tap alternatives a layperson mapping offers ("heart failure", "bypass surgery" for "heart
 * problem") are complete questions, and like every other chip each is dry-run validated before it is shown (in
 * parallel: a dry run never touches the warehouse).
 */
async function validateAlternates(candidates: string[]): Promise<string[]> {
  if (candidates.length === 0) {
    return [];
  }

  const engine = getRuntimeEngine();
  const checked = await Promise.all(
    candidates.map(async (candidate) => ((await engine.execute({ question: candidate, dryRun: true })).success ? candidate : undefined)),
  );

  return checked.filter((candidate): candidate is string => candidate !== undefined);
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

  // Normal execution (Turn 1 or standalone query). Batch 5A-1: the summary and the tie note start the moment the
  // answer exists, while the engine is still building the suggestions, so the two no longer run one after the other.
  let early: { summary: Promise<string | undefined>; tie: Promise<string | undefined> } | undefined;
  const result = await executeRuntime(request, requestId, (answer) => {
    if (answer.success && answer.rows.length > 0 && !early) {
      const rows = answer.rows as Record<string, unknown>[];
      early = {
        summary: buildVerifiedSummary(request.question, rows).catch(() => undefined),
        tie: describeResultNote(rows, (answer as { executedParameters?: Record<string, unknown> }).executedParameters),
      };
    }
  });
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
    const graceful = gracefulFailureMessage(result.trace);
    const declined = lastGate(result.trace, "llm-normalization");
    // Batch 5A-2: a model decline that named what was asked for gets an intent-aware reply, and the nearest answerable
    // questions it named (dry-run like every chip) come first among the chips.
    const interpreted = graceful ? undefined : buildInterpretedRefusal(declined, result.error, BLUNT_FAILURE_MESSAGES, getDomainCapabilities().coverageSummary, request.question);
    const closest = interpreted ? await validateAlternates(gateAlternates(declined)) : [];

    return {
      success: false,
      answer: "",
      error: graceful ?? interpreted ?? softenBluntFailureMessage(result.error),
      requestId,
      answerability: result.answerability,
      trace: result.trace,
      suggestions: closest.length > 0 ? [...new Set([...closest, ...(result.suggestions ?? [])])].slice(0, 3) : result.suggestions,
    };
  }

  // Batch 5A-1 (D4): what a layperson phrase was read as goes into the answer text, plain (apps/web renders `summary` in
  // a bare <p>, no markdown), ahead of the tie disclosure and the model's sentence; the alternatives come first among
  // the chips. `summary` is present whenever there is a note, even when the model's sentence was rejected or late.
  // Only a rewrite that was actually used carries a reading: a `fallback` that the deterministic pipeline then answered
  // on its own must never be shown with the model's (unused) interpretation.
  const rewriteGate = lastGate(result.trace, "llm-normalization");
  const lay = rewriteGate?.status === "rewritten" ? rewriteGate.detail : undefined;
  const [verifiedSummary, tie, alternates] = await Promise.all([
    early ? early.summary : buildVerifiedSummary(request.question, result.rows as Record<string, unknown>[]),
    early ? early.tie : Promise.resolve(undefined),
    validateAlternates(typeof lay?.alternates === "string" ? lay.alternates.split("\n").filter(Boolean) : []),
  ]);
  const ignored = lastGate(result.trace, "unaccounted-word-guard");
  // Batch 5A-2: what the model reported as unsupported and rewrote without ("mental health"): the answer is broader than asked.
  const dropped = lay
    ? droppedTerms(
        typeof lay.unsupported_terms === "string" ? lay.unsupported_terms.split("; ") : [],
        typeof lay.interpretation === "string" ? lay.interpretation : undefined,
        typeof lay.canonicalQuestion === "string" ? lay.canonicalQuestion : undefined,
        request.question,
      )
    : [];
  const summary = composeSummary(
    typeof lay?.interpretation === "string" ? lay.interpretation : undefined,
    dropped.length > 0 ? buildIgnoredNote(dropped) : undefined,
    ignored?.status === "annotated" && typeof ignored.detail?.unaccountedWords === "string" ? buildIgnoredNote(ignored.detail.unaccountedWords.split(" ")) : undefined,
    tie,
    verifiedSummary,
  );
  const suggestions = alternates.length > 0 ? [...new Set([...alternates, ...(result.suggestions ?? [])])].slice(0, 4) : result.suggestions;

  return {
    success: true,
    answer: JSON.stringify(result.rows, null, 2),
    requestId,
    answerability: result.answerability,
    trace: result.trace,
    suggestions,
    ...(summary ? { summary } : {}),
    metadata: {
      rowCount: result.rowCount,
    },
  };
}