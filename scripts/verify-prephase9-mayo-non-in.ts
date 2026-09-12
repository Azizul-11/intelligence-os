/**
 * Tier0 Task 3: Mayo Rochester Non-"in" Qualifier — Audit Reproduction.
 *
 * READ-ONLY reproduction script (Part 2 of the Task 3 master prompt).
 * No assertions - this is audit evidence against the live remote DB, not
 * a regression gate. Reports actual current behavior for every query
 * shape named in the master prompt plus the additional shapes this
 * audit's own investigation surfaced (see F3_AUDIT_QUERIES_MAYO_NON_IN.md).
 *
 * Run: npx tsx scripts/verify-prephase9-mayo-non-in.ts
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

const queries = [
  // Master prompt's original 12
  "Mayo Clinic Rochester Minnesota overall rating",
  "Mayo Clinic in Rochester Minnesota overall rating",
  "Mayo Clinic Rochester Minnesota",
  "Cleveland Clinic Ohio overall rating",
  "Cleveland Clinic in Ohio overall rating",
  "Johns Hopkins Baltimore Maryland",
  "Johns Hopkins in Baltimore Maryland",
  "Mayo Clinic Jacksonville Florida",
  "Mayo Clinic in Jacksonville Florida",
  "Memorial Hospital Texas",
  "Birmingham Alabama overall ratings",
  "Johns Hopkins Texas",
  // Additional shapes this audit's own investigation surfaced
  "Mayo Clinic in Rochester, Minnesota overall rating",
  "Mayo Clinic Hospital Rochester overall rating",
  "Mayo Clinic Hospital Rochester Minnesota overall rating",
  "Memorial Hospital in Texas overall rating",
  "Johns Hopkins overall rating",
];

async function main() {
  for (const question of queries) {
    const { spyEngine, getCalls } = countingEngine();
    const result = await spyEngine.execute({ question });
    const rows = (result.rows ?? []) as any[];

    console.log("\n" + "=".repeat(80));
    console.log("QUERY:", question);
    console.log("success:", result.success, "| answerability:", JSON.stringify(result.answerability?.status), JSON.stringify(result.answerability?.reason));
    console.log("rowCount:", result.rowCount, "| sqlCalls:", getCalls(), "| error:", result.error);
    if (rows.length > 0) {
      console.log("facility_ids:", rows.map((r) => r.facility_id).join(", "));
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
