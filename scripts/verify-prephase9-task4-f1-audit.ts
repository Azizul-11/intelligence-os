/**
 * Tier0 Task 4: F1 Benchmark Word-Order — Audit Reproduction.
 *
 * READ-ONLY diagnostic script against the live remote DB. No assertions
 * - this is audit evidence, not a regression gate. Reports, for every
 * query pair named in the master prompt:
 *
 * - Semantic layer: every metric-typed candidate resolved, its
 *   `direction` (asc/desc), and whether it was `isFallback` (introduced
 *   by a Healthcare lexical-rewrite idiom rather than named explicitly
 *   by the user - see domain-packs/healthcare/src/lexical-rewrites.ts).
 * - Planning layer: the resulting ExecutionPlan's `operation`, primary
 *   `metric`, full `metrics[]` (with each metric's own direction), and
 *   `filters`.
 * - Runtime layer: `success`, `answerability.status`/`reason`,
 *   `rowCount`, `sqlCalls` (spy-instrumented), and up to 3 result rows.
 *
 * Fulfills both "Live Reproduction & Failure Matrix" and "Step 2 Repro
 * Evidence" from the master prompt in one script (they asked for the
 * same live-pipeline evidence twice under different script names -
 * consolidated here, noted in the audit report).
 *
 * Run: npx tsx scripts/verify-prephase9-task4-f1-audit.ts
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
import type { ExecutionPlan } from "../packages/contracts/src/execution/execution-plan";

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
const planner = new QueryPlanner();
const mapper = new ExecutionPlanMapper();
const client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
const adapter = new SupabaseDatabaseAdapter(client);
const executor = new SqlExecutor(adapter);

function planOnly(query: string): ExecutionPlan | null {
  const semanticResult = semantic.resolve(query);

  if (!semanticResult.resolved) {
    return null;
  }

  const planResult = planner.createPlan(semanticResult);

  if (!planResult.success || !planResult.plan) {
    return null;
  }

  return mapper.map(planResult.plan);
}

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

const pairs: { label: string; queries: string[] }[] = [
  { label: "1. mortality ranking, lowest", queries: ["hospitals with lowest mortality", "lowest mortality hospitals"] },
  { label: "2. mortality ranking, highest", queries: ["hospitals with highest mortality", "highest mortality hospitals"] },
  { label: "3. readmission ranking, lowest", queries: ["hospitals with lowest readmission", "lowest readmission hospitals"] },
  { label: "4. readmission ranking, highest", queries: ["hospitals with highest readmission", "highest readmission hospitals"] },
  { label: "5. ranking-idiom placement, mortality", queries: ["best hospitals by mortality", "hospitals best by mortality", "hospitals by mortality best"] },
  { label: "6. ranking-idiom placement, readmission", queries: ["best hospitals by readmission", "hospitals best by readmission"] },
  { label: "7. overall rating ranking, best", queries: ["hospitals with best overall rating", "best overall rating hospitals"] },
  { label: "8. overall rating ranking, highest", queries: ["hospitals with highest overall rating", "highest overall rating hospitals"] },
  { label: "9. final-vision multi-metric best", queries: ["which hospitals have the best mortality and readmission performance?"] },
  { label: "10. multi-metric lowest", queries: ["show me hospitals with lowest mortality and readmission"] },
  { label: "11. F1+F8 combined (geographic + ranking)", queries: ["Texas hospitals with lowest mortality", "lowest mortality Texas hospitals"] },
  { label: "12. geographic + idiom placement", queries: ["best hospitals in Texas by mortality", "Texas best hospitals by mortality"] },
];

function describeCandidates(query: string) {
  const sem = semantic.resolve(query);
  const metricCandidates = sem.matches.filter((m) => m.semanticType === "metric");
  return metricCandidates.map((m) => ({
    canonicalKey: m.canonicalKey,
    phrase: m.phrase,
    direction: m.direction ?? null,
    isFallback: m.isFallback ?? false,
  }));
}

async function runOne(question: string) {
  const candidates = describeCandidates(question);
  const plan = planOnly(question);
  const { spyEngine, getCalls } = countingEngine();
  const result = await spyEngine.execute({ question });
  const rows = (result.rows ?? []) as any[];

  console.log(`  Q: "${question}"`);
  console.log(`    metric candidates: ${JSON.stringify(candidates)}`);
  console.log(
    `    plan: operation=${plan?.operation ?? "n/a"} metric=${plan?.metric ?? "n/a"} metrics=${JSON.stringify(plan?.metrics ?? null)} filters=${JSON.stringify(plan?.filters ?? [])} ordering=${JSON.stringify(plan?.ordering ?? null)}`,
  );
  console.log(
    `    runtime: success=${result.success} answerability=${JSON.stringify(result.answerability?.status)}/${JSON.stringify(result.answerability?.reason)} rowCount=${result.rowCount} sqlCalls=${getCalls()} error=${JSON.stringify(result.error)}`,
  );
  if (rows.length > 0) {
    console.log(`    sample rows (up to 3): ${JSON.stringify(rows.slice(0, 3))}`);
  }
  console.log();
}

async function main() {
  for (const pair of pairs) {
    console.log("=".repeat(90));
    console.log("PAIR:", pair.label);
    console.log("=".repeat(90));
    for (const question of pair.queries) {
      await runOne(question);
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
