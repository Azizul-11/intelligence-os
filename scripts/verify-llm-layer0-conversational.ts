/** Layer 0 verification: regex classifier separates conversational from analytical input, and handleConversational() gives an onboarding answer with dry-run-validated suggestions (live catalog). Run: npx tsx scripts/verify-llm-layer0-conversational.ts */
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
// ConversationalFix (2026-09-27): imports the real whole-utterance-anchored classifier; the old prefix-matching copy swallowed "hi show me hospitals in HI".
import { isConversational } from "../supabase/functions/orchestrator/services/conversational";

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
const planner = new QueryPlanner();
const mapper = new ExecutionPlanMapper();
const client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
const adapter = new SupabaseDatabaseAdapter(client);
const executor = new SqlExecutor(adapter);
const engine = createRuntimeEngine({ runtime, semantic, planner, executionPlanMapper: mapper, executor });

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
  console.log("LLM INTEGRATION LAYER 0 — CONVERSATIONAL FRONT-DOOR VERIFICATION");
  console.log("=".repeat(100));

  console.log("\n--- A: classifier correctly identifies conversational input ---");
  const conversationalExamples = ["hi", "Hey", "hello", "what can you do", "help", "thanks", "bye"];
  const analyticalExamples = [
    "Best hospitals in Texas",
    "hospitals with best safeties",
    "who is president",
    "weather today",
    "show me 3 star hospital",
  ];
  for (const q of conversationalExamples) {
    check(`A-CONV-${q}`, `"${q}" classified as conversational`, isConversational(q), `isConversational=${isConversational(q)}`);
  }
  // "who is president" and "weather today" are NOT conversational by this
  // classifier - they are real (if off-topic) questions, handled by the
  // broadened Layer 1 + softened-message path instead, not Layer 0.
  for (const q of ["Best hospitals in Texas", "hospitals with best safeties", "show me 3 star hospital"]) {
    check(`A-ANALYTICAL-${q}`, `"${q}" NOT classified as conversational`, !isConversational(q), `isConversational=${isConversational(q)}`);
  }

  console.log("\n--- B: real, live handleConversational() output ---");
  for (const q of ["hi", "what can you do", "help"]) {
    const result = await llmGateway.handleConversational(q, DOMAIN_CAPABILITIES);
    console.log(`    "${q}" -> answer=${JSON.stringify(result.answer.slice(0, 100))}... suggestions=${JSON.stringify(result.suggestions)}`);
    check(`B-ANSWER-${q}`, "produces a non-empty warm answer", result.answer.length > 10, result.answer);
    check(`B-SUGGESTIONS-${q}`, "produces 2-4 suggestions", result.suggestions.length >= 2 && result.suggestions.length <= 4, JSON.stringify(result.suggestions));

    // Every suggestion Layer 0 offers must be real and executable - same
    // Every-Turn/100%-Executable guarantee as every other suggestion.
    for (const suggestion of result.suggestions) {
      const trial = await engine.execute({ question: suggestion });
      check(`B-EXEC-${q}-${suggestion}`, `suggestion "${suggestion}" executes successfully`, trial.success, `success=${trial.success} error=${trial.error}`);
    }
  }

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
