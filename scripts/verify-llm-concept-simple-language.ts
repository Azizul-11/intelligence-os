/**
 * LLM Integration — clinical-concept simple-language verification.
 *
 * PrePhase 9.5 Round 2: confirms simple human phrasings for the 6
 * condition-specific concepts with a real, deterministic SQL path (AMI,
 * CABG, COPD, Hip/Knee, Heart Failure, Pneumonia) now resolve to real
 * answers via the capability-aware `normalizeMessyLanguage()` gateway -
 * these previously failed even after PrePhase 9.5 Round 1, because the
 * capability catalog had zero awareness of clinical concepts at all
 * (only top-level metrics/states/ownerships).
 *
 * `sepsis rate` is deliberately included as a NEGATIVE control: sepsis
 * is a registered `ConceptDefinition` with no `measureCodesByMetric` (no
 * real warehouse measure code backs it) - it must keep failing honestly
 * (`success:false`), never be forced into a fabricated answer. Confirmed
 * live before writing this script that `CONCEPTS_WITH_REAL_MEASURES` in
 * `capability-catalog.ts` correctly excludes it.
 *
 * Run: npx tsx scripts/verify-llm-concept-simple-language.ts
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

// Mirrors domain-registry.ts's own wiring exactly.
const engine = createRuntimeEngine({
  runtime,
  semantic,
  planner,
  executionPlanMapper: mapper,
  executor,
  llmFallback: async (question: string) => {
    const result = await llmGateway.normalizeMessyLanguage(question, DOMAIN_CAPABILITIES);
    if (result.status === "ok" && result.canonical_question) {
      return { canonicalQuestion: result.canonical_question };
    }
    if (result.status === "need_clarification" && result.reason) {
      return { clarification: result.reason };
    }
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

async function run(id: string, question: string) {
  const result = await engine.execute({ question });
  console.log(`    [${id}] "${question}" -> success=${result.success} rowCount=${result.rowCount} error=${JSON.stringify(result.error)}`);
  check(id, `"${question}" now resolves to real condition-specific rows`, result.success === true && result.rowCount > 0, `success=${result.success} error=${result.error}`);
}

async function main() {
  console.log("=".repeat(100));
  console.log("LLM INTEGRATION — CLINICAL-CONCEPT SIMPLE-LANGUAGE VERIFICATION");
  console.log("=".repeat(100));

  await run("B1-AMI-DEATH-RATE", "heart attack death rate");
  await run("B2-AMI-SURVIVAL", "best heart attack survival");
  await run("B3-HEART-CARE", "Show me best heart care hospital");
  await run("B4-CABG-BYPASS", "bypass surgery readmission");
  await run("B5-CABG-CODE", "CABG readmission");
  await run("B6-HF-READMISSION", "heart failure readmission");
  await run("B7-PN-DEATH-RATE", "pneumonia death rate");
  await run("B8-HIP-KNEE", "hip and knee complication");
  await run("B9-COPD", "COPD readmission");

  console.log("\n--- negative control: sepsis has no real measure code, must keep failing honestly ---");
  {
    const result = await engine.execute({ question: "sepsis rate" });
    console.log(`    [B10-SEPSIS-CONTROL] "sepsis rate" -> success=${result.success} error=${JSON.stringify(result.error)}`);
    check("B10-SEPSIS-CONTROL", "sepsis (no real measure code) correctly fails, never fabricates an answer", result.success === false, JSON.stringify(result));
  }

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
