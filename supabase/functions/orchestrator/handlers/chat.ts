import type { ChatRequest } from "../types/request.ts";
import type { ChatResponse } from "../types/response.ts";

import { supabase } from "../../shared/supabase.ts";
import { executeRuntime } from "../services/runtime.ts";
import { handleContinuation } from "../services/continuation.ts";
import { isConversational, isPureGreeting, preflightClarification } from "../services/conversational.ts";
import { createPendingInteraction } from "@intelligence/runtime-engine";
import { getDomainMetrics, getDomainCapabilities, getRuntimeEngine, describeResultNote, describeFocus } from "../services/domain-registry.ts";
import { sanitizeDatabaseError } from "../services/sanitize-error.ts";
import { buildIgnoredNote, buildInterpretedRefusal, buildScopeMessage, buildUnaccountedMessage, composeSummary, droppedTerms, gateAlternates } from "../services/graceful-message.ts";
import { buildVerifiedSummary, recordRejectedSummary, type VerifiedSummary } from "../services/verified-summary.ts";
import { llmGateway, withLlmCallLog } from "@intelligence/llm-model-gateway";

/** LLM Layer 0 front-door router: a whole-utterance greeting/meta/thanks message skips Gate 1 so a first "hi" does not hit "Unable to resolve question.".
 * Plain regex classifier (services/conversational.ts), never decides whether a real analytical question is answerable. */

/** Layer 0 suggestion chips are dry-run validated like every other suggestion (Every-Turn/100%-Executable invariants),
 * via RuntimeRequest.dryRun, because Layer 0 returns before the engine's own suggestion code runs. */
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

/** PrePhase 9.5, Guardrail 6: softens only the catalogued blunt/generic failure messages so no raw "compiler failure" text reaches the frontend.
 * Already-informative messages (Phase 8.10 guidance, F5 negation, identity clarification) are handled by earlier branches and left alone. */
const BLUNT_FAILURE_MESSAGES = new Set([
  "Unable to resolve question.",
  "SQL template not found.",
  "I don't have enough specific information to identify exactly which record this question refers to. Please include more identifying detail (such as a full name or location) and try again.",
  // Bug E (Phase 3.1.1): also soften "Unable to create query plan." (QueryPlanner refusal, e.g. off-topic "weather in Texas");
  // the generic redirect below fits every case.
  "Unable to create query plan.",
]);

function softenBluntFailureMessage(error: string | undefined): string | undefined {
  if (!error || !BLUNT_FAILURE_MESSAGES.has(error)) {
    return error;
  }
  return "I specialize in US hospital clinical performance and healthcare analytics - I couldn't quite match that to something I track. Here are a few things I can help with:";
}

// buildVerifiedSummary, recordRejectedSummary and VerifiedSummary moved to services/verified-summary.ts (2026-09-27)
// so continuation.ts can use them without a circular import.

type TraceGate = { phase: string; status: string; detail?: Record<string, unknown> };

/** The last trace entry of a phase (the tracker records an "enter" first and the outcome after it). */
function lastGate(trace: unknown, phase: string): TraceGate | undefined {
  return [...((trace as TraceGate[] | undefined) ?? [])].reverse().find((gate) => gate.phase === phase);
}

/** Batch 5A-1: a refusal that names what it could not do (unsupported topic, or words the pipeline would not drop) instead of the static card;
 * the tappable questions come as engine-validated `suggestions`. */
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

/** Batch 5A-1: layperson-mapping alternatives are complete questions; each is dry-run validated before display
 * (in parallel, a dry run never touches the warehouse). */
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

// Tier0 Task 2 (F8) Phase 2: persists the PhaseGateTracker trace as one row per request. Evidentiary only, never read back by the runtime.
// Fire-and-forget: best-effort tracing must never fail or slow the answer, so errors are logged, not thrown.
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

/** Keeps a promise running after the response is sent (Supabase EdgeRuntime.waitUntil); elsewhere (local scripts) it simply runs detached. */
function runInBackground(promise: Promise<unknown>): void {
  (globalThis as { EdgeRuntime?: { waitUntil?: (task: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(promise);
}

/** Every response carries server latency and each LLM call (role, model, latency) so the frontend can attribute a slow query without log access. */
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

  // LLM Layer 0: intercepted BEFORE Gate 1 and the pipeline; never SQL, only an onboarding/deflection reply (see isConversational()).
  if (isConversational(request.question)) {
    const capabilities = getDomainCapabilities();
    const welcome = capabilities.prompts?.conversational?.fallbackAnswer;
    // A bare greeting needs no model: the domain's canned welcome plus its example questions (already known to be answerable) reply instantly.
    if (welcome && isPureGreeting(request.question)) {
      return { success: true, answer: welcome, suggestions: capabilities.exampleAnswerableQuestions.slice(0, 3), answerability: { status: "conversational" } };
    }
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

  // Batch 5A-1: summary and tie note start as soon as the answer exists, in parallel with suggestion building.
  // Phase 3.5: the summary waits for the deterministic note so the model knows what is already shown and does not repeat it.
  let early: { summary: Promise<VerifiedSummary>; tie: Promise<string | undefined> } | undefined;
  const result = await executeRuntime(request, requestId, (answer) => {
    if (answer.success && answer.rows.length > 0 && !early) {
      const rows = answer.rows as Record<string, unknown>[];
      const parameters = (answer as { executedParameters?: Record<string, unknown> }).executedParameters;
      const tie = describeResultNote(rows, parameters);
      early = {
        summary: tie.then((note) => buildVerifiedSummary(request.question, rows, parameters, note ? [note] : [])).catch(() => ({})),
        tie,
      };
    }
  });
  // The trace row is written off the response path; recordRejectedSummary below waits for it because it updates that same row.
  const tracePersisted = persistTrace(requestId, request.question, result);
  runInBackground(tracePersisted);

  // ConversationalFix (2026-09-27): the `conversationalCheck` hook caught small talk / a capability question; 0 SQL,
  // same shape as Layer 0's regex branch, and `result.rows` is empty so the success-path machinery below does not apply.
  if (result.success && result.answerability?.status === "conversational") {
    const suggestions = result.suggestions && result.suggestions.length > 0 ? result.suggestions : getDomainCapabilities().exampleAnswerableQuestions.slice(0, 3);
    return {
      success: true,
      answer: result.conversationalAnswer ?? "",
      requestId,
      answerability: result.answerability,
      trace: result.trace,
      suggestions,
    };
  }

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
        // Phase 8.10 Layer 2: enrich candidates ({value: facility_id, label: "CITY, COUNTY County, STATE"}, see entity-provider.ts); a hospital-family candidate (Batch 4)
        // leads with a name that may contain ", ", so the last three parts are the place and the rest the name.
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
      error: graceful ?? interpreted ?? sanitizeDatabaseError(softenBluntFailureMessage(result.error)),
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
  const [verified, tie, alternates] = await Promise.all([
    early
      ? early.summary
      : buildVerifiedSummary(request.question, result.rows as Record<string, unknown>[], (result as { executedParameters?: Record<string, unknown> }).executedParameters, []).catch(
          (): VerifiedSummary => ({}),
        ),
    // 2,000 sweep (Batch A3): an empty answer gets the domain's one-line explanation instead of a blank table.
    early ? early.tie : result.rows.length === 0 ? describeResultNote([], (result as { executedParameters?: Record<string, unknown> }).executedParameters) : Promise.resolve(undefined),
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
    verified.summary,
  );
  const suggestions = alternates.length > 0 ? [...new Set([...alternates, ...(result.suggestions ?? [])])].slice(0, 4) : result.suggestions;

  if (verified.rejected) {
    await tracePersisted;
    await recordRejectedSummary(requestId, result.trace, verified.rejected);
  }

  const focus = result.executionPlan ? describeFocus(result.executionPlan, result.rows as Record<string, unknown>[]) : undefined;

  return {
    success: true,
    answer: JSON.stringify(result.rows, null, 2),
    requestId,
    answerability: result.answerability,
    trace: result.trace,
    suggestions,
    ...(focus ? { presentation: { focus } } : {}),
    ...(summary ? { summary } : {}),
    metadata: {
      rowCount: result.rowCount,
      ...(verified.rejected ? { summaryRejected: verified.rejected } : {}),
    },
  };
}