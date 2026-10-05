/** PrePhase 9.5 Round 3: condition mortality/readmission rankings must return the LOWEST (best) score first; the direction lexicon buckets "lowest"/"worst" as "asc", so the 2 templates now ORDER BY ascending unconditionally.
 * Run: npx tsx scripts/verify-concept-ranking-direction.ts */
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

async function runMonotonic(id: string, question: string, column: string) {
  const result = await engine.execute({ question });
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  const values = rows.map((r) => Number(r[column])).filter((v) => !Number.isNaN(v));
  console.log(`    [${id}] "${question}" -> success=${result.success} rowCount=${result.rowCount} first3=${JSON.stringify(values.slice(0, 3))}`);
  const isAscending = values.every((v, i) => i === 0 || v >= values[i - 1]!);
  check(id, `"${question}" ${column} is ascending (lowest/best first)`, result.success === true && values.length > 1 && isAscending, `values=${JSON.stringify(values)}`);
}

async function main() {
  console.log("=".repeat(100));
  console.log("CONCEPT RANKING DIRECTION VERIFICATION (lowest/best score first)");
  console.log("=".repeat(100));

  await runMonotonic("R1-AMI-MORTALITY", "heart attack death rate", "score");
  await runMonotonic("R2-CABG-READMISSION", "bypass surgery readmission", "excess_readmission_ratio");
  await runMonotonic("R3-COPD-MORTALITY", "COPD mortality hospitals", "score");
  await runMonotonic("R4-HEART-FAILURE-READMISSION", "heart failure readmission", "excess_readmission_ratio");
  await runMonotonic("R5-PNEUMONIA-MORTALITY", "pneumonia death rate", "score");
  await runMonotonic("R6-HIP-KNEE-READMISSION", "hip and knee readmission", "excess_readmission_ratio");

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
