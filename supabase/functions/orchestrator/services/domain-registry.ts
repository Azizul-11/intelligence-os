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
import { DOMAIN_CAPABILITIES, expandUppercaseStateAbbreviations } from "@intelligence/healthcare-domain";

import { supabase } from "../../shared/supabase.ts";
import { normalizeQuestion } from "./normalizer-hook.ts";

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

  const planner = new QueryPlanner();

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
    // Bug L Beyond (Phase 2): deterministic, case-sensitive US state
    // abbreviation expansion (e.g. "goverment hospital in CA" ->
    // "goverment hospital in California") - runs BEFORE Layer 1, so the
    // already-deterministic ownership-typo fix and this fix compose
    // into a fully deterministic resolution for the compound case that
    // previously depended on the LLM gateway's own (less reliable
    // across its multi-vendor fallback chain) abbreviation expansion.
    // See state-abbreviation-preprocessor.ts's own header comment for
    // why this is deliberately narrow (case-sensitive, "VA" excluded).
    preprocessQuestion: expandUppercaseStateAbbreviations,
    // LLM Integration Layer 1: the only place Universal Core's optional
    // llmFallback hook is ever supplied - packages/runtime-engine itself
    // stays 100% LLM-unaware. Maps the gateway's richer
    // {status, canonical_question, reason} shape down to the narrow
    // {canonicalQuestion} | {clarification} | null the hook actually
    // needs. PrePhase 9.5: "need_clarification" (the LLM declining to
    // guess a missing scope, e.g. a state, rather than inventing one)
    // is surfaced as a clarification instead of being treated the same
    // as "fallback" (silently give up, keep the original raw error).
    //
    // R7: `meta` carries which tier answered (provider/model/attempts/
    // latency/tiers tried) onto the "llm-normalization" trace entry. Universal
    // Core records it verbatim and never reads it; a result with only `meta`
    // (no usable answer) is traced as "unavailable", exactly like `null`.
    // Batch 1 (Step 1.3): the mapping lives in normalizer-hook.ts (shared with
    // the local-live harness); a decline that names `unsupported_terms` is now
    // a binding refusal instead of being discarded.
    // Batch 3: a raw question that names an unsupported topic is refused here before the model is called.
    llmFallback: async (question: string) =>
      normalizeQuestion(question, DOMAIN_CAPABILITIES, (text) => llmGateway.normalizeMessyLanguage(text, DOMAIN_CAPABILITIES)),
  });

  return runtimeEngine;
}


/**
 * PrePhase 9.5: the healthcare Domain SDK's own capability manifest -
 * used by chat.ts's Layer 0 conversational router so its onboarding
 * answer/example chips come from the same domain-owned catalog Layer 1
 * already uses, never a second, independently-maintained list.
 */
export function getDomainCapabilities() {
  return DOMAIN_CAPABILITIES;
}

/**
 * Get domain metrics for display name lookup.
 * Phase 8.10 Layer 2: Used by guidance Turn 1 to map capability IDs to display names.
 */
export function getDomainMetrics(): readonly any[] {
  // Ensure runtime is initialized
  if (!domainRuntime) {
    getRuntimeEngine();
  }
  return domainRuntime?.domain?.metrics || [];
}

/**
 * Tier0 Task 2 (F8): direct, deterministic single-hospital rating lookup
 * by facility_id - used by the hospital-ranking clarification's "lookup"
 * Turn 2 (see reconstruct-hospital-choice.ts). Deliberately bypasses the
 * full NL semantic pipeline: re-typing a hospital's own stored name and
 * re-resolving it is not guaranteed to round-trip to the same facility
 * (see reconstruct-hospital-choice.ts's own comment), whereas the
 * facility_id captured at Turn 1 is unambiguous already. Reuses the
 * existing, already-registered `hospital-overall-rating` template
 * verbatim - no new SQL template.
 */
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
