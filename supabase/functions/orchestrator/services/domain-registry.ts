import { healthcareDomain } from "@intelligence/healthcare-domain";

import { createDomainRuntime } from "@intelligence/domain-runtime";
import { createSemanticResolver } from "@intelligence/semantic";
import { QueryPlanner, ExecutionPlanMapper } from "@intelligence/query-planner";
import {
  SqlExecutor,
  SupabaseDatabaseAdapter,
} from "@intelligence/sql-executor";
import { createRuntimeEngine } from "@intelligence/runtime-engine";
import { llmGateway } from "@intelligence/llm-model-gateway";
import {
  DOMAIN_CAPABILITIES,
  expandUppercaseStateAbbreviations,
  describeOverallRatingTies,
  correctPlaceCollidingTypos,
  buildSummaryContext,
  summaryFactNumbers,
  summaryVocabulary,
  describeResultFocus,
  type SummaryContext,
} from "@intelligence/healthcare-domain";

import { supabase } from "../../shared/supabase.ts";
import { normalizeQuestion, precheckUnsupported } from "./normalizer-hook.ts";

import type { RuntimeEngine } from "@intelligence/runtime-engine";

import * as RuntimeEngineModule from "@intelligence/runtime-engine";

let runtimeEngine: RuntimeEngine | undefined;
let domainRuntime: ReturnType<typeof createDomainRuntime> | undefined;
let sharedExecutor: SqlExecutor | undefined;

export function getRuntimeEngine(): RuntimeEngine {
  if (runtimeEngine) {
    return runtimeEngine;
  }

  const runtime = createDomainRuntime(healthcareDomain);
  domainRuntime = runtime;

  const semantic = createSemanticResolver(
    runtime.registry,
    runtime.entityProvider,
  );

  // Batch 5A-1: the domain's own filler words ("checkup", "problem"), as data, so they stop blocking a default ranking.
  const planner = new QueryPlanner({ fillerWords: DOMAIN_CAPABILITIES.fillerWords ?? [] });

  const executor = new SqlExecutor(
    new SupabaseDatabaseAdapter(supabase),
  );
  sharedExecutor = executor;

  console.log(
  "Runtime Engine Module:",
  RuntimeEngineModule,
);

  runtimeEngine = createRuntimeEngine({
    runtime,
    semantic,
    planner,
    executionPlanMapper: new ExecutionPlanMapper(),
    executor,
    // Bug L Beyond (Phase 2): deterministic, case-sensitive state-abbreviation expansion ("hospital in CA" -> "California") before Layer 1
    // (see state-abbreviation-preprocessor.ts; "VA" excluded). Batch 5A-1: a misspelling that is also a place name ("hart") is corrected first.
    preprocessQuestion: (question: string) => expandUppercaseStateAbbreviations(correctPlaceCollidingTypos(question)),
    // LLM Layer 1: the only place Universal Core's optional llmFallback hook is supplied (runtime-engine stays LLM-unaware); mapping lives in normalizer-hook.ts.
    // PrePhase 9.5: "need_clarification" surfaces as a clarification; R7: `meta` is traced verbatim; Batch 1/3: unsupported terms (model-reported or raw-question) are a binding refusal.
    llmFallback: async (question: string) =>
      normalizeQuestion(question, DOMAIN_CAPABILITIES, (text) => llmGateway.normalizeMessyLanguage(text, DOMAIN_CAPABILITIES)),
    // Batch 5C: the same deterministic scope check, for the questions that skip the front door (a named hospital, a chip).
    unsupportedPrecheck: (question: string) => precheckUnsupported(question, DOMAIN_CAPABILITIES),
    // ConversationalFix (2026-09-27): cheap free-tier classification for small talk the front-door regex misses (see AUDIT_CONVERSATIONAL_INTENT_ROUTING.md);
    // only a confident "conversational" verdict reuses handleConversational(), anything else returns undefined and the paid normalizer runs as before.
    conversationalCheck: async (question: string) => {
      const intent = await llmGateway.classifyConversationalIntent(question, DOMAIN_CAPABILITIES);
      return intent === "conversational" ? llmGateway.handleConversational(question, DOMAIN_CAPABILITIES) : undefined;
    },
  });

  return runtimeEngine;
}


/** PrePhase 9.5: the Domain SDK capability manifest, so chat.ts's Layer 0 onboarding answer/chips share Layer 1's single domain-owned catalog. */
export function getDomainCapabilities() {
  return DOMAIN_CAPABILITIES;
}

/** Domain metrics for display-name lookup (Phase 8.10 Layer 2 guidance Turn 1 maps capability IDs to names). */
export function getDomainMetrics(): readonly any[] {
  // Ensure runtime is initialized
  if (!domainRuntime) {
    getRuntimeEngine();
  }
  return domainRuntime?.domain?.metrics || [];
}

/** Batch 5A-1 (D5): the domain's one-sentence description of an answer ("384 hospitals nationwide hold a 5-star rating, ...");
 * SQL and wording live in the domain pack, this is the shared executor. `undefined` when nothing to say or the count failed. */
export async function describeResultNote(
  rows: readonly Record<string, unknown>[],
  parameters: Record<string, unknown> | undefined,
): Promise<string | undefined> {
  try {
    if (!sharedExecutor) {
      getRuntimeEngine();
    }

    return await describeOverallRatingTies({ rows, parameters, run: (template, params) => sharedExecutor!.execute(template, params) });
  } catch (error) {
    console.error("[Result note failed]", error);
    return undefined;
  }
}

/** Phase 3.5: the domain pack's prepared summary context plus the numbers/names the grounding check must accept;
 * this only forwards the answer's rows and parameters. */
export function prepareSummaryContext(
  rows: readonly Record<string, unknown>[],
  parameters: Record<string, unknown> | undefined,
  alreadyShown: readonly string[],
  focus?: Record<string, string | undefined>,
): { context: SummaryContext; factNumbers: string[]; vocabulary: string[] } {
  const context = buildSummaryContext({ rows, parameters, alreadyShown, focus });
  return { context, factNumbers: summaryFactNumbers(context), vocabulary: summaryVocabulary(context) };
}

/** The focus of a direct overall-rating lookup (no plan exists on those bypass paths); the rows are exactly the rating. */
export const OVERALL_RATING_FOCUS: Record<string, string> = { kind: "fact", metric: "hospital-overall-rating" };

/** What the domain says this answer is about (one fact, or a measure family), for the frontend's focused card and tab. Opaque here. */
export function describeFocus(
  plan: Parameters<typeof describeResultFocus>[0],
  rows: readonly Record<string, unknown>[],
): Record<string, string | undefined> | undefined {
  return describeResultFocus(plan, rows);
}

/** Tier0 Task 2 (F8): direct single-hospital rating lookup by facility_id for the ranking clarification's "lookup" Turn 2 (see reconstruct-hospital-choice.ts);
 * bypasses NL resolution because re-typing a name may not round-trip to the same facility; reuses the `hospital-overall-rating` template. */
export async function lookupHospitalOverallRating(facilityId: string) {
  if (!domainRuntime || !sharedExecutor) {
    getRuntimeEngine();
  }

  const template = domainRuntime!.sqlResolver.resolve("hospital-overall-rating");

  if (!template.found || !template.template) {
    return { success: false, rows: [], rowCount: 0, error: "Lookup template unavailable" };
  }

  return sharedExecutor!.execute(template.template, { hospitalId: facilityId });
}
