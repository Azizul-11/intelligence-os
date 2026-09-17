/**
 * PrePhase 9.5 Round 3 — ownership+state crowd-out verification.
 *
 * Confirms a scope filter (ownership) combined with a state and NO
 * explicit ranking word now defaults to a ranked top-10 view instead of
 * silently dumping the state's full (up to 100-row) hospital list -
 * live dogfooding found "non-profit hospitals in California" returning
 * 100 unranked rows. Root cause: the phrase "hospitals in" resolves to
 * Healthcare's own non-rankable "Hospital List" metric, which prevented
 * `QueryPlanner`'s existing `discoverDefaultRankableMetric` fallback
 * (already working for a bare "non-profit hospitals", no state) from
 * ever running. Fixed via the new, domain-agnostic
 * `EntityCategory.isGeographicScope` contract flag: default-ranking
 * discovery now also fires whenever the only resolved metric is
 * non-rankable AND a non-geographic scope entity (e.g. ownership) is
 * also present - a PURE geographic list ("hospitals in Texas",
 * "hospitals in Birmingham Alabama") has no such entity and is
 * confirmed unaffected below.
 *
 * Run: npx tsx scripts/verify-ownership-state-crowdout.ts
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

async function run(id: string, question: string, expectRowCountAtMost: number | null, label: string) {
  const result = await engine.execute({ question });
  console.log(`    [${id}] "${question}" -> success=${result.success} rowCount=${result.rowCount}`);
  // null = control case: must stay a real, uncapped-by-this-fix list (rowCount
  // > 10 proves the crowd-out fix's narrower gate did NOT also swallow this
  // pure-geographic case - a false "still 10" pass here would hide an
  // overcorrection).
  const ok = expectRowCountAtMost === null
    ? result.success === true && (result.rowCount ?? 0) > 10
    : result.success === true && (result.rowCount ?? 0) <= expectRowCountAtMost;
  check(id, label, ok, `success=${result.success} rowCount=${result.rowCount}`);
}

async function main() {
  console.log("=".repeat(100));
  console.log("OWNERSHIP + STATE CROWD-OUT FIX VERIFICATION");
  console.log("=".repeat(100));

  await run("CO1-NONPROFIT-CA", "non-profit hospitals in California", 10, "non-profit+CA now ranked top-10, not 100");
  await run("CO2-GOVERNMENT-TX", "government hospitals in Texas", 10, "government+TX now ranked top-10, not 100");
  await run("CO3-PROPRIETARY-FL", "proprietary hospitals in Florida", 10, "proprietary+FL now ranked top-10, not 100");

  console.log("\n--- regression control: pure geographic list must stay unaffected ---");
  await run("CO4-CONTROL-TEXAS-LIST", "hospitals in Texas", null, "bare state list unaffected (real full-size list expected)");
  await run("CO5-CONTROL-BIRMINGHAM", "hospitals in Birmingham Alabama", null, "bare city+state list unaffected");

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
