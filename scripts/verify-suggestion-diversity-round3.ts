/**
 * PrePhase 9.5 Round 3 — suggestion diversity verification (concepts +
 * Layer 0).
 *
 * Confirms two things live dogfooding found broken:
 * 1. A concept-scoped success (e.g. "heart attack death rate") now
 *    offers suggestions that pivot across OTHER clinical concepts
 *    (bypass surgery, heart failure, etc.), not only unrelated
 *    top-level metrics - `buildSuccessSuggestionPool()` gained a
 *    concept-aware branch this round.
 * 2. Layer 0 (`handleConversational`) no longer offers the exact same
 *    4 suggestions on every single conversational turn - its prompt is
 *    no longer restricted to only the fixed 5-item example list.
 *
 * Every suggestion is still independently dry-run/live executed here,
 * same 100%-executable guarantee as every other suggestion in this
 * codebase.
 *
 * Run: npx tsx scripts/verify-suggestion-diversity-round3.ts
 */
import "dotenv/config";

import { healthcareDomain, DOMAIN_CAPABILITIES } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { SqlExecutor } from "../packages/sql-executor/src/sql-executor";
import { SupabaseDatabaseAdapter } from "../packages/sql-executor/src/supabase-database-adapter";
import { createClient } from "@supabase/supabase-js";
import { llmGateway } from "../packages/llm-model-gateway/src/llm-model-gateway";
import { env } from "./shared/env";

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
const planner = new QueryPlanner();
const mapper = new ExecutionPlanMapper();
const client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
const adapter = new SupabaseDatabaseAdapter(client);
const executor = new SqlExecutor(adapter);
const engine = createRuntimeEngine({
  runtime,
  semantic,
  planner,
  executionPlanMapper: mapper,
  executor,
  llmFallback: async (question: string) => {
    const result = await llmGateway.normalizeMessyLanguage(question, DOMAIN_CAPABILITIES);
    if (result.status === "ok" && result.canonical_question) return { canonicalQuestion: result.canonical_question };
    if (result.status === "need_clarification" && result.reason) return { clarification: result.reason };
    return null;
  },
});

let pass = 0;
let fail = 0;
function check(id: string, label: string, condition: boolean, detail: string) {
  if (condition) {
    pass++;
    console.log(`  [PASS] ${id} ${label}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${id} ${label} -- ${detail}`);
  }
}

async function main() {
  console.log("=".repeat(100));
  console.log("SUGGESTION DIVERSITY VERIFICATION (concepts + Layer 0)");
  console.log("=".repeat(100));

  console.log("\n--- concept-query suggestion pool ---");
  const result = await engine.execute({ question: "heart attack death rate", includeSuggestions: true });
  const suggestions = result.suggestions ?? [];
  console.log(`"heart attack death rate" -> success=${result.success} suggestions=${JSON.stringify(suggestions)}`);
  check("D1-CONCEPT-SUGGESTIONS-PRESENT", "concept query returns 3 suggestions", result.success === true && suggestions.length === 3, JSON.stringify(suggestions));
  const mentionsOtherConcept = suggestions.some((s) =>
    // Batch 5B-1..5B-3: stroke, hospital-wide mortality, the PSIs and the survey dimensions are concepts in the pivot pool too.
    /copd|bypass|cabg|heart failure|pneumonia|hip|knee|sepsis|stroke|hospital-wide|pressure ulcer|postoperative|perioperative|fracture|puncture|pneumothorax|patient safety composite|cleanliness|quietness|communication|discharge|recommend|survey/i.test(s) &&
      !/heart attack|ami/i.test(s),
  );
  check("D2-CONCEPT-PIVOT-PRESENT", "at least one suggestion pivots to a DIFFERENT clinical concept", mentionsOtherConcept, JSON.stringify(suggestions));
  for (const suggestion of suggestions) {
    const trial = await engine.execute({ question: suggestion });
    check(`D3-EXEC-${suggestion}`, `suggestion "${suggestion}" independently executes with rows`, trial.success && (trial.rowCount ?? 0) > 0, `success=${trial.success} rowCount=${trial.rowCount}`);
  }

  console.log("\n--- Layer 0 conversational diversity across repeated calls ---");
  const calls: string[][] = [];
  for (let i = 0; i < 3; i++) {
    const conv = await llmGateway.handleConversational("hi", DOMAIN_CAPABILITIES);
    console.log(`call ${i + 1}: ${JSON.stringify(conv.suggestions)}`);
    calls.push(conv.suggestions);
  }
  const allIdentical = calls.every((c) => JSON.stringify(c) === JSON.stringify(calls[0]));
  check("D4-LAYER0-VARIES", "Layer 0 suggestions are NOT byte-identical across all 3 calls", !allIdentical, JSON.stringify(calls));

  console.log("\n" + "=".repeat(100));
  console.log(`RESULT: ${pass} passed, ${fail} failed (${pass + fail} total)`);
  console.log("=".repeat(100));

  if (fail > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
