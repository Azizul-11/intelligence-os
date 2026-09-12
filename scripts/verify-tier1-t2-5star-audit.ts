/**
 * Pre-Phase 9 Tier1 Task 2 Audit: 5-Star Value Filter Routing.
 *
 * STRICTLY DIAGNOSTIC - read-only, no production writes. Live, in-process,
 * spy-instrumented against the remote Supabase warehouse.
 *
 * Run: npx tsx scripts/verify-tier1-t2-5star-audit.ts
 */
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

function countingEngine() {
  let calls = 0;
  const spyExecutor = {
    execute: async (...args: Parameters<typeof executor.execute>) => {
      calls++;
      return executor.execute(...args);
    },
  };
  const spyEngine = createRuntimeEngine({
    runtime, semantic, planner, executionPlanMapper: mapper,
    executor: spyExecutor as unknown as typeof executor,
  });
  return { spyEngine, getCalls: () => calls };
}

async function run(id: string, question: string) {
  const { spyEngine, getCalls } = countingEngine();
  const result = await spyEngine.execute({ question });
  const sqlCalls = getCalls();
  const rows = (result.rows ?? []) as any[];
  const distinctRatings = [...new Set(rows.map((r) => r.overall_rating))];
  console.log(
    `[${id}] "${question}" -> success=${result.success} status=${result.answerability?.status} rowCount=${rows.length} sqlCalls=${sqlCalls} distinctRatings=${JSON.stringify(distinctRatings)} error=${JSON.stringify(result.error)}`,
  );
}

async function main() {
  console.log("=".repeat(90));
  console.log("TIER1 TASK 2 AUDIT: 5-STAR VALUE FILTER ROUTING (READ-ONLY)");
  console.log("=".repeat(90));

  await run("T2-1-5STAR-BARE", "Show me 5-star hospitals");
  await run("T2-2-5-SPACE-STAR", "Show me 5 star hospitals");
  await run("T2-3-5-STARS-PLURAL", "Show me hospitals with 5 stars");
  await run("T2-4-FIVE-STAR-WORD", "Show me five star hospitals");
  await run("T2-5-4STAR", "Show me 4-star hospitals");
  await run("T2-6-1STAR", "Show me 1-star hospitals");
  await run("T2-7-5STAR-TEXAS", "Show me 5-star hospitals in Texas");
  await run("T2-8-5STAR-CALIFORNIA", "Show me 5-star hospitals in California");
  await run("T2-9-5STAR-NONPROFIT", "Show me non-profit 5-star hospitals");
  await run("T2-10-5STAR-AMI", "Show me 5-star hospitals with best AMI mortality");
  await run("T2-CTRL-BEST-OVERALL-RATING", "Show me hospitals with best overall rating");

  console.log("\n--- DB check: distinct overall_rating values ---");
  const { data } = await client.from("warehouse_hospitals").select("overall_rating").limit(3000);
  console.log(JSON.stringify([...new Set((data ?? []).map((r: any) => r.overall_rating))].sort()));
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
