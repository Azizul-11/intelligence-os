/**
 * LLM Integration — combined ownership + clinical-concept simple-language
 * verification.
 *
 * PrePhase 9.5 Round 2: confirms a question naming BOTH a simple
 * ownership phrase and a simple clinical-concept phrase resolves
 * correctly - both are independent, already-working mechanisms (ownership
 * deterministic, concept via the newly capability-aware gateway); this
 * confirms they compose without interfering with each other.
 *
 * Run: npx tsx scripts/verify-llm-ownership-concept-combined.ts
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
    if (result.status === "ok" && result.canonical_question) {
      return { canonicalQuestion: result.canonical_question };
    }
    if (result.status === "need_clarification" && result.reason) {
      return { clarification: result.reason };
    }
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

async function run(id: string, question: string) {
  const result = await engine.execute({ question });
  console.log(`    [${id}] "${question}" -> success=${result.success} rowCount=${result.rowCount} error=${JSON.stringify(result.error)}`);
  check(id, `"${question}" resolves with both ownership and concept applied`, result.success === true && result.rowCount > 0, `success=${result.success} error=${result.error}`);
}

async function main() {
  console.log("=".repeat(100));
  console.log("LLM INTEGRATION — OWNERSHIP + CONCEPT COMBINED VERIFICATION");
  console.log("=".repeat(100));

  await run("C1-NONPROFIT-HEART-ATTACK", "non-profit hospitals with heart attack death rate");
  await run("C2-PRIVATE-BYPASS", "private hospitals with bypass surgery readmission");
  await run("C3-NONPROFIT-HEART-STATE", "Best non-profit hospitals for heart attack in Texas");
  await run("C4-GOVERNMENT-PNEUMONIA", "government hospitals with pneumonia death rate");

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
