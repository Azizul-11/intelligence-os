/**
 * Bug D (Phase 3.2, 2026-09-18) — condition-specific `compare` operation
 * silently returning generic data verification.
 *
 * Root cause: `HealthcareExecutionStrategy.selectTemplateFromPlan()`'s
 * `operation === "compare" && explicitStateSet` branch (Tier1 Task 5
 * Phase 3, multi-state comparison routing) had no `measureCodeFilter`
 * check, unlike the sibling `operation === "rank"` branch just above it -
 * "Compare Readmission Rates for Pneumonia in Florida vs Georgia" fell
 * through to the generic `readmission-rate-ranking` template, which has
 * no `measureCode` parameter and silently returned generic readmission
 * counts instead of the pneumonia-specific `READM-30-PN-HRRP` measure -
 * `success:true`, no error, genuinely wrong data.
 *
 * Fix: the same `measureCodeFilter` check the "rank" branch already has,
 * added to the "compare" + multi-state branch too, reusing the exact
 * same 2 condition-specific template ids (already multi-state-capable
 * via Tier1 Task 5's own `states`/`multiState` parameters) - zero new
 * templates, zero new mechanism, zero hardcoded condition/state names.
 *
 * Run against a DETERMINISTIC-ONLY engine (no llmFallback) to prove the
 * fix works without any LLM dependency.
 *
 * Run: npx tsx scripts/verify-bug-d-pneumonia-compare.ts
 */
import "dotenv/config";

import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { expandUppercaseStateAbbreviations } from "../domain-packs/healthcare/src/runtime/state-abbreviation-preprocessor";
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
const executor = new SqlExecutor(new SupabaseDatabaseAdapter(client));

const engine = createRuntimeEngine({
  runtime,
  semantic,
  planner,
  executionPlanMapper: mapper,
  executor,
  preprocessQuestion: expandUppercaseStateAbbreviations,
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

async function expectConditionSpecific(id: string, question: string, expectedMeasureCode: string, expectedStates?: string[]) {
  const result = await engine.execute({ question });
  const rows = (result.rows as Record<string, unknown>[]) ?? [];
  const measureCodes = [...new Set(rows.map((r) => r["measure_code"]))];
  const states = [...new Set(rows.map((r) => r["state"]))];
  const allExpectedMeasure = rows.length > 0 && measureCodes.length === 1 && measureCodes[0] === expectedMeasureCode;
  const statesOk = !expectedStates || expectedStates.every((s) => states.includes(s));
  console.log(`    [${id}] "${question}" -> success=${result.success} rowCount=${result.rowCount} measureCodes=${JSON.stringify(measureCodes)} states=${JSON.stringify(states)}`);
  check(
    id,
    `"${question}" every row measure_code="${expectedMeasureCode}"${expectedStates ? `, states include ${JSON.stringify(expectedStates)}` : ""}`,
    result.success === true && allExpectedMeasure && statesOk,
    `success=${result.success} rowCount=${result.rowCount} measureCodes=${JSON.stringify(measureCodes)}`,
  );
}

async function main() {
  console.log("=".repeat(100));
  console.log("BUG D — CONDITION-SPECIFIC COMPARE — DETERMINISTIC VERIFICATION");
  console.log("=".repeat(100));

  console.log("\n--- Bug D: multi-state condition-specific comparisons (the fix) ---");
  await expectConditionSpecific("D-1", "Compare Readmission Rates for Pneumonia in Florida vs Georgia", "READM-30-PN-HRRP", ["FL", "GA"]);
  await expectConditionSpecific("D-2", "Compare heart attack mortality between Florida and Georgia", "MORT_30_AMI", ["FL", "GA"]);

  console.log("\n--- Single-state condition controls (must stay PASS, unaffected) ---");
  await expectConditionSpecific("CTRL-1", "pneumonia readmission Florida", "READM-30-PN-HRRP", ["FL"]);
  const heartAttack = await engine.execute({ question: "heart attack death rate" });
  const heartAttackRows = (heartAttack.rows as Record<string, unknown>[]) ?? [];
  check("CTRL-2", "'heart attack death rate' -> lowest death rate first (NYU Langone ~6.7)", heartAttack.success === true && heartAttack.rowCount === 10 && (heartAttackRows[0]?.["score"] as number) < 10, `success=${heartAttack.success} rowCount=${heartAttack.rowCount} first=${JSON.stringify(heartAttackRows[0])}`);

  console.log("\n--- General multi-hospital comparisons (must stay PASS, no measureCode involved) ---");
  const mayoVsCleveland = await engine.execute({ question: "compare Mayo Clinic vs Cleveland Clinic" });
  check("CTRL-3", "'compare Mayo Clinic vs Cleveland Clinic' -> 2 rows, full dossier", mayoVsCleveland.success === true && mayoVsCleveland.rowCount === 2, `success=${mayoVsCleveland.success} rowCount=${mayoVsCleveland.rowCount}`);

  console.log("\n--- Bug E / Bug L spot-checks (must stay PASS, unrelated to this fix) ---");
  const weather = await engine.execute({ question: "what's the weather in Texas?" });
  check("CTRL-4", "'what's the weather in Texas?' -> refused, no fabrication", weather.success === false && (weather.rowCount ?? 0) === 0, `success=${weather.success} rowCount=${weather.rowCount}`);
  const govCa = await engine.execute({ question: "government hospital in Ca" });
  const govCaRows = (govCa.rows as Record<string, unknown>[]) ?? [];
  check("CTRL-5", "'government hospital in Ca' (camel-case) -> 10 rows, all CA", govCa.success === true && govCa.rowCount === 10 && govCaRows.every((r) => r["state"] === "CA"), `success=${govCa.success} rowCount=${govCa.rowCount}`);

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
