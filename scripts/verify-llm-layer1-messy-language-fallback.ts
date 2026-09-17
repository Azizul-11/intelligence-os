/**
 * LLM Integration Layer 1 — end-to-end integration proof.
 *
 * Wires the real llmGateway.normalizeMessyLanguage() into
 * createRuntimeEngine()'s llmFallback hook exactly the way
 * supabase/functions/orchestrator/services/domain-registry.ts does, then
 * proves the full recursive re-resolution behavior live: a bare
 * unresolved question gets rewritten, re-run through the ENTIRE pipeline
 * (not just re-checked), and produces real SQL execution with rowCount >
 * 0 - while confirming Phase 8.13 (NOT_DIRECTLY_ANSWERABLE => sqlCalls=0,
 * ANSWERABLE => sqlCalls>0) holds throughout, and that a request without
 * the hook (every pre-existing caller) is completely unaffected.
 *
 * Run: npx tsx scripts/verify-llm-layer1-messy-language-fallback.ts
 */
import "dotenv/config"; // MUST be first - see verify-llm-layer2-suggestion-rephrasing.ts's own doc comment for why.

import { healthcareDomain } from "../domain-packs/healthcare/src/index";
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

// Mirrors domain-registry.ts's own wiring exactly.
const engineWithLLM = createRuntimeEngine({
  runtime,
  semantic,
  planner,
  executionPlanMapper: mapper,
  executor,
  llmFallback: async (question: string) => {
    const result = await llmGateway.normalizeMessyLanguage(question);
    return result.status === "ok" && result.canonical_question
      ? { canonicalQuestion: result.canonical_question }
      : null;
  },
});

const engineWithoutLLM = createRuntimeEngine({ runtime, semantic, planner, executionPlanMapper: mapper, executor });

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

function sqlCallsFor(result: { trace?: { sqlCalls?: number }[] }): number {
  return (result.trace ?? []).reduce((sum, gate) => sum + (gate.sqlCalls ?? 0), 0);
}

async function main() {
  console.log("=".repeat(100));
  console.log("LLM INTEGRATION LAYER 1 — END-TO-END MESSY-LANGUAGE FALLBACK PROOF");
  console.log("=".repeat(100));

  console.log("\n--- A: a real dead end, rewritten and re-resolved into a real answer ---");
  {
    const result = await engineWithLLM.execute({ question: "hospitals with best safeties" });
    console.log(`    "hospitals with best safeties" -> success=${result.success} rowCount=${result.rowCount} answerability=${JSON.stringify(result.answerability)} sqlCalls=${sqlCallsFor(result)}`);
    check("A1-RESOLVED", "the LLM rewrite let this bare dead-end question resolve to a real answer", result.success === true && result.rowCount > 0, JSON.stringify(result.answerability));
    check("A2-PHASE-8.13-ANSWERABLE", "ANSWERABLE => sqlCalls > 0 holds for the LLM-assisted path too", result.answerability?.status === "answerable" && sqlCallsFor(result) > 0, `sqlCalls=${sqlCallsFor(result)}`);
  }

  console.log("\n--- B: genuinely off-topic still fails cleanly (no invented capability) ---");
  {
    const result = await engineWithLLM.execute({ question: "what is the weather like today" });
    console.log(`    "what is the weather like today" -> success=${result.success} answerability=${JSON.stringify(result.answerability)} sqlCalls=${sqlCallsFor(result)}`);
    check("B1-STILL-FAILS", "off-topic question still fails (LLM correctly returns fallback, not an invented metric)", result.success === false, JSON.stringify(result.answerability));
    check("B2-PHASE-8.13-REFUSED", "NOT_DIRECTLY_ANSWERABLE => sqlCalls=0 holds even after attempting an LLM rewrite", result.answerability?.status === "not_directly_answerable" && sqlCallsFor(result) === 0, `sqlCalls=${sqlCallsFor(result)}`);
  }

  console.log("\n--- C: without the hook (every pre-existing caller), behavior is completely unchanged ---");
  {
    const result = await engineWithoutLLM.execute({ question: "hospitals with best safeties" });
    console.log(`    "hospitals with best safeties" (no llmFallback) -> success=${result.success} error=${JSON.stringify(result.error)} answerability=${JSON.stringify(result.answerability)}`);
    check("C1-UNCHANGED-BASELINE", "without the hook, the same dead end still fails exactly as before this milestone", result.success === false && result.error === "Unable to resolve question." && result.answerability?.reason === "semantic-incomplete", JSON.stringify(result));
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
