/**
 * Tier0 Task 5: F12 Ownership & Condition-Specific Measures — Audit
 * Reproduction.
 *
 * READ-ONLY diagnostic script against the live remote DB. No
 * assertions - this is audit evidence, not a regression gate. Reports,
 * for every query in Groups A/B/C:
 *
 * - Semantic layer: every candidate resolved, its `semanticType` and
 *   `canonicalKey` (to see whether "non-profit"/"AMI"/"CABG" etc.
 *   resolve as anything at all, and if so, as what type).
 * - Planning layer: `plan.filters`, `plan.metric`, `ExecutionPlan`
 *   shape.
 * - Completeness layer: `assessPlanCompleteness()`'s own discrepancy
 *   report (this already exists in packages/query-planner/src/
 *   plan-completeness.ts and is already partially gated in
 *   create-runtime-engine.ts for "concept"/"metric" discrepancies -
 *   this script surfaces it directly so the audit can see exactly what
 *   it does and does not catch for each query shape).
 * - Runtime layer: `success`, `answerability`, `rowCount`, `sqlCalls`,
 *   sample rows (including `ownership`/`measure_code` when present).
 *
 * Run: npx tsx scripts/verify-prephase9-task5-f12-audit.ts
 */
import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { assessPlanCompleteness } from "../packages/query-planner/src/plan-completeness";
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

function planOnly(query: string) {
  const semanticResult = semantic.resolve(query);
  if (!semanticResult.resolved) return { plan: null, semanticResult, completeness: null };
  const planResult = planner.createPlan(semanticResult, runtime.domain.metrics);
  if (!planResult.success || !planResult.plan) return { plan: null, semanticResult, completeness: null };
  const executionPlan: ExecutionPlan = mapper.map(planResult.plan);
  const completeness = assessPlanCompleteness(semanticResult.matches, executionPlan, planResult.plan.semantic);
  return { plan: executionPlan, semanticResult, completeness };
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

const groups: { label: string; queries: string[] }[] = [
  {
    label: "Group A - Ownership Filtering",
    queries: [
      "Show me non-profit hospitals with lowest mortality",
      "Show me non-profit hospitals in Texas with best overall rating",
      "Show me proprietary hospitals with lowest readmission",
      "Show me government hospitals with highest overall rating",
      "Show me non-profit hospitals",
      "California non-profit hospitals with lowest mortality",
    ],
  },
  {
    label: "Group B - Condition-Specific Measure Codes",
    queries: [
      "Show me hospitals with best AMI mortality",
      "Hospitals with lowest CABG readmission",
      "Best hospitals for COPD readmission",
      "Hospitals with best Hip/Knee readmission",
      "Show me hospitals with lowest heart failure mortality",
      "Hospitals with best pneumonia readmission",
    ],
  },
  {
    label: "Group C - Controls",
    queries: [
      "hospitals with lowest mortality",
      "Texas hospitals with lowest mortality",
      "Mayo Clinic Rochester Minnesota overall rating",
    ],
  },
];

async function runOne(question: string) {
  const { plan, semanticResult, completeness } = planOnly(question);
  const candidates = semanticResult.matches.map((m) => ({
    phrase: m.phrase,
    semanticType: m.semanticType,
    canonicalKey: m.canonicalKey,
  }));
  const { spyEngine, getCalls } = countingEngine();
  const result = await spyEngine.execute({ question });
  const rows = (result.rows ?? []) as any[];

  console.log(`  Q: "${question}"`);
  console.log(`    candidates: ${JSON.stringify(candidates)}`);
  console.log(
    `    plan: operation=${plan?.operation ?? "n/a"} metric=${plan?.metric ?? "n/a"} filters=${JSON.stringify(plan?.filters ?? [])}`,
  );
  console.log(
    `    completeness: complete=${completeness?.complete ?? "n/a"} discrepancies=${JSON.stringify(completeness?.discrepancies ?? [])}`,
  );
  console.log(
    `    runtime: success=${result.success} answerability=${JSON.stringify(result.answerability?.status)}/${JSON.stringify(result.answerability?.reason)} rowCount=${result.rowCount} sqlCalls=${getCalls()} error=${JSON.stringify(result.error)}`,
  );
  if (rows.length > 0) {
    console.log(`    sample rows (up to 3): ${JSON.stringify(rows.slice(0, 3))}`);
  }

  let verdict = "?";
  if (!result.success) {
    verdict = "safe failure / refusal (no data returned)";
  } else {
    const ownershipValues = new Set(rows.map((r) => r.ownership).filter(Boolean));
    const measureCodes = new Set(rows.map((r) => r.measure_code).filter(Boolean));
    if (ownershipValues.size > 1) {
      verdict = `🔴 SILENT-WRONG: success:true but ${ownershipValues.size} distinct ownership values in result (${[...ownershipValues].join(", ")}) - filter not applied`;
    } else if (measureCodes.size > 1) {
      verdict = `🔴 SILENT-WRONG: success:true but ${measureCodes.size} distinct measure_codes in result - condition not filtered`;
    } else {
      verdict = "✅ answerable, no visible ownership/measure-code mixing in this row shape";
    }
  }
  console.log(`    VERDICT: ${verdict}`);
  console.log();
}

async function main() {
  for (const group of groups) {
    console.log("=".repeat(90));
    console.log(group.label);
    console.log("=".repeat(90));
    for (const question of group.queries) {
      await runOne(question);
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
