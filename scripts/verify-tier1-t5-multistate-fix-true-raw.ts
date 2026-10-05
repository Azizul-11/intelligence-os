/** Tier1 Task 5 true-raw / no-limit fix, SUPERSEDED (2026-09-12) by verify-tier1-t5-multistate-fix-balanced-limits.ts (dumping every row was a
 * payload/UX problem). Assertions now only check "both states present, no crowd-out". */
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

async function run(question: string) {
  const result = await engine.execute({ question });
  const rows = (result.rows ?? []) as any[];
  const states = Array.from(new Set(rows.map((r) => r.state).filter(Boolean)));
  console.log(`    "${question}" -> success=${result.success} rowCount=${result.rowCount} states=${JSON.stringify(states)}`);
  return { result, rows, states };
}

async function main() {
  console.log("=".repeat(100));
  console.log("TIER1 TASK 5 UI/UX GAP FIX VERIFICATION: TRUE RAW / NO LIMIT (POST-FIX)");
  console.log("=".repeat(100));

  console.log("\n--- Group A: multi-state ranking - balanced (5 per state), both states genuinely represented, no crowd-out ---");
  {
    const { result, states } = await run("Best hospitals in Texas and California");
    check("A-1", `"Best hospitals in Texas and California" returns exactly 10 rows (5 per state, balanced), both TX and CA present`, result.rowCount === 10 && states.includes("TX") && states.includes("CA"), `rowCount=${result.rowCount} states=${JSON.stringify(states)}`);
  }
  {
    const { result, states } = await run("Top hospitals in New York and Florida");
    check("A-2", `"Top hospitals in New York and Florida" returns exactly 10 rows (5 per state, balanced), both NY and FL present`, result.rowCount === 10 && states.includes("NY") && states.includes("FL"), `rowCount=${result.rowCount} states=${JSON.stringify(states)}`);
  }
  {
    const { result, states } = await run("Best hospitals in Texas, California and Florida");
    check("A-3", `"Best hospitals in Texas, California and Florida" returns exactly 15 rows (5 per state, balanced), all 3 states present`, result.rowCount === 15 && states.includes("TX") && states.includes("CA") && states.includes("FL"), `rowCount=${result.rowCount} states=${JSON.stringify(states)}`);
  }
  {
    const [{ result: reversed }, { result: forward }] = await Promise.all([run("Best hospitals in California and Texas"), run("Best hospitals in Texas and California")]);
    check("A-4", "order-agnostic: same rowCount regardless of mention order", reversed.rowCount === forward.rowCount, `reversed=${reversed.rowCount} forward=${forward.rowCount}`);
  }

  console.log("\n--- Group B: multi-state compare (Phase 3) - same balanced-limits fix applies via the same ranking template ---");
  {
    const { result, states } = await run("Compare hospital ratings in Texas and California");
    check("B-1", `"Compare hospital ratings in Texas and California" returns exactly 10 rows (5 per state, balanced), both states present`, result.rowCount === 10 && states.includes("TX") && states.includes("CA"), `rowCount=${result.rowCount} states=${JSON.stringify(states)}`);
  }

  console.log("\n--- Group C: single-state ranking - still correctly scoped, no other state leaks in, sensible ceiling of 10 ---");
  {
    const { result, states } = await run("Best hospitals in Texas");
    check("C-1", `single-state "Best hospitals in Texas" returns exactly 10 rows (nationwide/single-state ceiling), TX only`, result.rowCount === 10 && states.length === 1 && states[0] === "TX", `rowCount=${result.rowCount} states=${JSON.stringify(states)}`);
  }

  console.log("\n--- Group D: 5-star (already below any prior cap) - unaffected, still exactly right ---");
  {
    const { result, rows } = await run("Show me 5-star hospitals in Texas and California");
    const allFive = rows.every((r) => String(r.overall_rating) === "5");
    check("D-1", "5-star Texas+California unaffected: 58 rows, all rating 5", result.rowCount === 58 && allFive, `rowCount=${result.rowCount} allFive=${allFive}`);
  }

  console.log("\n" + "=".repeat(100));
  console.log(`RESULT: ${pass} PASS, ${fail} FAIL`);
  console.log("=".repeat(100));

  if (fail > 0) process.exit(1);
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
