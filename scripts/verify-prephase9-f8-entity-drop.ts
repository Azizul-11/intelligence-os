/**
 * Pre-Phase 9 Task 2: F8 Entity-Drop on Ranking Intent — Audit Reproduction.
 *
 * READ-ONLY reproduction script (Part A.4 of the F8 master prompt). Does
 * not assert pass/fail yet - this is audit evidence, not a regression gate.
 * Reports the actual current ExecutionPlan/SQL/row-count/answerability for
 * each query shape so the product design decision can be made from ground
 * truth, not from potentially-stale historical docs.
 *
 * Run: npx tsx scripts/verify-prephase9-f8-entity-drop.ts
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

const engine = createRuntimeEngine({ runtime, semantic, planner, executionPlanMapper: mapper, executor });

const queries = [
  "Best hospitals in Texas",
  "Highest-rated hospitals in California",
  "Top hospitals in Texas by mortality",
  "Hospitals like Mayo Clinic",
  "Mayo Clinic ranking",
  "Compare Mayo Clinic and Cleveland Clinic",
  "Best hospitals in Texas and California",
  "Best hospitals in Texas by overall rating and mortality",
];

async function main() {
  for (const question of queries) {
    console.log("\n" + "=".repeat(80));
    console.log("QUERY:", question);
    console.log("=".repeat(80));

    const result = await engine.execute({ question });

    console.log("success:", result.success);
    console.log("answerability:", JSON.stringify(result.answerability));
    console.log("rowCount:", result.rowCount);
    console.log("error:", result.error);

    if (result.rows && result.rows.length > 0) {
      const states = new Set((result.rows as any[]).map((r) => r.state));
      console.log("distinct states in result:", Array.from(states));
      console.log("sample rows:", JSON.stringify(result.rows.slice(0, 3), null, 2));
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
