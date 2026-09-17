/**
 * LLM Integration — ownership simple-language verification.
 *
 * PrePhase 9.5 Round 2: confirms simple human ownership phrasings
 * ("non-profit", "nonprofit", "non profit", "private", "for-profit",
 * "government") all resolve to real answers. Unlike the concept fix in
 * this same round, this is NOT an LLM capability - `ownership-directory.ts`
 * (Tier0 Task 5 Part A) + the `defaultRankable` list-intent fallback
 * (Tier1 Task 5 V2 Sub-Task A) already handle every one of these
 * deterministically, confirmed live before writing this script. This
 * script exists to PROVE that (and guard against a future regression),
 * not because a new fix was needed here.
 *
 * Run: npx tsx scripts/verify-llm-ownership-simple-language.ts
 */
import "dotenv/config";

import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { SqlExecutor } from "../packages/sql-executor/src/sql-executor";
import { SupabaseDatabaseAdapter } from "../packages/sql-executor/src/supabase-database-adapter";
import { createClient } from "@supabase/supabase-js";
import { env } from "./shared/env";

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
const planner = new QueryPlanner();
const mapper = new ExecutionPlanMapper();
const client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
const adapter = new SupabaseDatabaseAdapter(client);
const executor = new SqlExecutor(adapter);
// Deliberately NO llmFallback - proves this is a deterministic capability,
// not something the LLM needs to rescue.
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

async function run(id: string, question: string) {
  const result = await engine.execute({ question });
  console.log(`    [${id}] "${question}" -> success=${result.success} rowCount=${result.rowCount} error=${JSON.stringify(result.error)}`);
  check(id, `"${question}" resolves deterministically to real ownership-filtered rows`, result.success === true && result.rowCount > 0, `success=${result.success} error=${result.error}`);
}

async function main() {
  console.log("=".repeat(100));
  console.log("LLM INTEGRATION — OWNERSHIP SIMPLE-LANGUAGE VERIFICATION (deterministic, no LLM)");
  console.log("=".repeat(100));

  await run("A1-NONPROFIT", "non-profit hospitals");
  await run("A2-NONPROFIT-NOSPACE", "nonprofit hospitals");
  await run("A3-NONPROFIT-SPACE", "non profit hospitals");
  await run("A4-PRIVATE", "private hospitals");
  await run("A5-GOVERNMENT", "government hospitals");
  await run("A6-FORPROFIT", "for-profit hospitals");
  await run("A7-FORPROFIT-SPACE", "for profit hospitals");
  await run("A8-PUBLIC", "public hospitals");
  await run("A9-NOTFORPROFIT", "not for profit hospitals");
  await run("A10-NONPROFIT-STATE", "non-profit hospitals in Texas with lowest mortality rate");

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
