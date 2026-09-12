/**
 * Pre-Phase 9 Tier1 Task 3 Audit: Layer 2 Continuation Prefix Parsing.
 *
 * STRICTLY DIAGNOSTIC - read-only, no production writes. Live, in-process,
 * spy-instrumented against the remote Supabase warehouse.
 *
 * Key finding this script demonstrates: "prefix parsing" was assumed to be
 * a missing-feature gap, but `domain-packs/healthcare/src/aliases/
 * hospital-detail.ts` ALREADY registers "tell me about" (and 5 variant
 * phrasings) as a literal metric alias mapped to a "hospital-detail"
 * profile lookup. The real, reproducible bug is a METRIC COLLISION: when
 * a real metric/concept also appears later in the same sentence (e.g.
 * "...mortality rate for heart attack"), BOTH "hospital-detail" (from the
 * prefix) and the real metric resolve simultaneously, and the
 * condition-specific request is silently downgraded to a generic
 * hospital-detail + secondary-aggregate-metric shape instead of the
 * correctly-scoped answer - success:true, wrong shape, not a clean
 * failure. Unregistered prefixes ("what about", "show me about") are
 * harmless no-ops (PhraseExtractor's exhaustive substrings already let
 * the rest of the sentence resolve normally regardless of what precedes
 * it) - they neither help nor break anything.
 *
 * Run: npx tsx scripts/verify-tier1-t3-prefix-audit.ts
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
