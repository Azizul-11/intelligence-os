/** Tier1 Task 3 Audit (DIAGNOSTIC ONLY, live). The real bug is a METRIC COLLISION, not missing prefix parsing: "tell me about" is already a
 * hospital-detail alias, so a later real metric/concept silently downgrades to hospital-detail (success:true, wrong shape). */
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
  const sample = rows[0];
  console.log(
    `[${id}] "${question}" -> success=${result.success} status=${result.answerability?.status} rowCount=${rows.length} sqlCalls=${sqlCalls} error=${JSON.stringify(result.error)} sample=${JSON.stringify(sample)}`,
  );
}

async function main() {
  console.log("=".repeat(90));
  console.log("TIER1 TASK 3 AUDIT: LAYER 2 CONTINUATION PREFIX PARSING (READ-ONLY)");
  console.log("=".repeat(90));

  await run("T3-1-TELL-ME-ABOUT-MAYO", "Tell me about Mayo Clinic");
  await run("T3-2-CTRL-BARE-MAYO", "Mayo Clinic");
  await run("T3-3-TELL-ME-ABOUT-MAYO-AMI", "Tell me about Mayo Clinic's mortality rate for heart attack");
  await run("T3-4-CTRL-WHAT-IS-MAYO-AMI", "What is Mayo Clinic's mortality rate for heart attack specifically?");
  await run("T3-5-TELL-ME-ABOUT-TEXAS", "Tell me about hospitals in Texas");
  await run("T3-6-CTRL-SHOW-ME-TEXAS", "Show me hospitals in Texas");
  await run("T3-7-WHAT-ABOUT-MAYO", "What about Mayo Clinic");
  await run("T3-8-SHOW-ME-ABOUT-MAYO", "Show me about Mayo Clinic");
  await run("T3-9-CAN-YOU-TELL-ME-ABOUT-MAYO", "Can you tell me about Mayo Clinic");
  await run("T3-10-COMBINED-PREFIX-5STAR-TEXAS", "Tell me about 5-star hospitals in Texas");
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
