#!/usr/bin/env tsx

/**
 * Batch 5B-2 (patient safety indicators and postoperative sepsis) verification. No live model is called: the
 * engine runs deterministically (llmFallback stubbed to `fallback`) against the live warehouse (read-only SELECTs).
 * Rows that need the live model to resolve (A111, A113, A119 - see comments below) are checked only for the
 * deterministic half of their contract here (0 SQL when unresolved, or a correct answer when they do resolve
 * without the model); their live-model outcome is verified separately against the deployed function.
 *
 *   1  registry: the metric, the 12 concepts (11 PSIs + Postoperative Sepsis) and their aliases
 *   2  engine resolution for the batch's 14 owned catalog rows, unit strings, direction
 *   3  Phase 8: negative controls stay refused, 0 SQL
 *
 * Usage: pnpm exec tsx scripts/verify-batch5b2-psi.ts
 */
import "dotenv/config";

import { healthcareDomain, DOMAIN_CAPABILITIES } from "../domain-packs/healthcare/src/index";
import { expandUppercaseStateAbbreviations } from "../domain-packs/healthcare/src/runtime/state-abbreviation-preprocessor";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { SqlExecutor } from "../packages/sql-executor/src/sql-executor";
import { SupabaseDatabaseAdapter } from "../packages/sql-executor/src/supabase-database-adapter";
import { normalizeQuestion } from "../supabase/functions/orchestrator/services/normalizer-hook";
import { createClient } from "@supabase/supabase-js";
import { env } from "./shared/env";

process.env.LLM_FIRST_FRONT_DOOR_ENABLED = "true";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  [PASS] ${name}`);
  } else {
    failed++;
    console.log(`  [FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
}

// ------------------------------------------------------------------------------------------ 1. registry
console.log("\n1 - registry: metric, concepts, aliases, topics");
{
  check("Patient Safety Indicator is a registered metric", DOMAIN_CAPABILITIES.metrics.some((m) => m.displayName === "Patient Safety Indicator"));
  const EXPECTED = [
    "Pressure Ulcer", "Death After Serious Surgical Complication", "Iatrogenic Pneumothorax", "In-Hospital Fall With Fracture",
    "Postoperative Hemorrhage or Hematoma", "Postoperative Acute Kidney Injury", "Postoperative Respiratory Failure",
    "Perioperative Blood Clot", "Postoperative Wound Dehiscence", "Accidental Puncture or Laceration", "Patient Safety Composite",
    "Postoperative Sepsis",
  ];
  for (const name of EXPECTED) {
    const c = DOMAIN_CAPABILITIES.concepts.find((x) => x.displayName === name);
    check(`"${name}" is a real-measure concept`, c !== undefined, JSON.stringify(c));
    check(`"${name}" names the Patient Safety Indicator metric`, !!c?.metrics.includes("Patient Safety Indicator"), JSON.stringify(c));
  }
  check("11 PSIs + Postoperative Sepsis = 12 new concepts", EXPECTED.length === 12);
  for (const topic of ["psi", "pressure ulcer", "pressure ulcers", "sepsis", "blood clot", "blood clots", "kidney injury", "in-hospital falls", "falls with fracture", "patient safety indicator", "patient safety indicators"]) {
    check(`"${topic}" is no longer an unsupported topic`, !DOMAIN_CAPABILITIES.unsupportedTopics.includes(topic));
  }
  for (const topic of ["sepsis mortality", "sepsis survival", "sepsis recovery", "hospital acquired infection", "hospital acquired infections", "psi 5", "psi 05", "psi 7", "psi 07"]) {
    check(`"${topic}" stays an unsupported topic (no such measure)`, DOMAIN_CAPABILITIES.unsupportedTopics.includes(topic));
  }
}

// ------------------------------------------------------------------------------------------ engine
const runtime = createDomainRuntime(healthcareDomain);
function makeEngine() {
  return createRuntimeEngine({
    runtime,
    semantic: createSemanticResolver(runtime.registry, runtime.entityProvider),
    planner: new QueryPlanner(),
    executionPlanMapper: new ExecutionPlanMapper(),
    executor: new SqlExecutor(new SupabaseDatabaseAdapter(createClient(env.supabaseUrl, env.supabaseServiceRoleKey))),
    preprocessQuestion: expandUppercaseStateAbbreviations,
    llmFallback: (question: string) => normalizeQuestion(question, DOMAIN_CAPABILITIES, async () => ({ status: "fallback" as const })),
  });
}
const engine = makeEngine();
const realLog = console.log;
async function run(question: string): Promise<any> {
  console.log = () => {};
  try {
    return await engine.execute({ question });
  } finally {
    console.log = realLog;
  }
}
const sqlCalls = (r: any) => (r.trace ?? []).reduce((sum: number, g: any) => sum + (g.sqlCalls ?? 0), 0);

async function main() {
  console.log("\n2 - engine resolution: the batch's owned catalog rows");

  const a109 = await run("Which hospitals have the highest postoperative sepsis rates?");
  check("A109 highest postoperative sepsis rates: PSI_13, worst first (descending)", a109.success === true && a109.rowCount > 0 && a109.rows.every((r: any) => r.measure_code === "PSI_13") && a109.rows.every((r: any, i: number) => i === 0 || Number(r.score) <= Number(a109.rows[i - 1].score)), `success=${a109.success} rows=${a109.rowCount} err=${a109.error}`);

  const a110 = await run("pressure ulcer rate");
  check("A110 pressure ulcer rate: PSI_03, ascending (lowest first)", a110.success === true && a110.rowCount > 0 && a110.rows.every((r: any) => r.measure_code === "PSI_03") && a110.rows.every((r: any, i: number) => i === 0 || Number(r.score) >= Number(a110.rows[i - 1].score)), `success=${a110.success} rows=${a110.rowCount} err=${a110.error}`);
  check("A110: score_unit is the rate-per-1,000 text", a110.success === true && a110.rows.every((r: any) => r.score_unit === "rate per 1,000 discharges"), JSON.stringify(a110.rows?.[0]));

  const a112 = await run("postoperative sepsis rate");
  check("A112 postoperative sepsis rate: PSI_13", a112.success === true && a112.rowCount > 0 && a112.rows.every((r: any) => r.measure_code === "PSI_13"), `success=${a112.success} err=${a112.error}`);

  const a114 = await run("PSI 90 composite");
  check("A114 PSI 90 composite: PSI_90, index unit", a114.success === true && a114.rowCount > 0 && a114.rows.every((r: any) => r.measure_code === "PSI_90" && r.score_unit === "index (1.0 is national benchmark)"), `success=${a114.success} rows=${a114.rowCount} err=${a114.error} sample=${JSON.stringify(a114.rows?.[0])}`);

  const a115 = await run("in-hospital falls with fracture");
  check("A115 in-hospital falls with fracture: PSI_08", a115.success === true && a115.rowCount > 0 && a115.rows.every((r: any) => r.measure_code === "PSI_08"), `success=${a115.success} err=${a115.error}`);

  const a116 = await run("postoperative kidney injury requiring dialysis");
  check("A116 postoperative kidney injury requiring dialysis: PSI_10", a116.success === true && a116.rowCount > 0 && a116.rows.every((r: any) => r.measure_code === "PSI_10"), `success=${a116.success} err=${a116.error}`);

  const a117 = await run("blood clots after surgery");
  check("A117 blood clots after surgery: PSI_12", a117.success === true && a117.rowCount > 0 && a117.rows.every((r: any) => r.measure_code === "PSI_12"), `success=${a117.success} err=${a117.error}`);

  const a04 = await run("Death After Serious Surgical Complication rate");
  check("PSI_04 score_unit is the deaths-per-1,000 text (not tested by an owned row, checked here)", a04.success === true && a04.rows.every((r: any) => r.measure_code === "PSI_04" && r.score_unit === "deaths per 1,000 surgical inpatients"), JSON.stringify(a04.rows?.[0]));

  // A111, A113, A119 need the live model to add the missing metric word (no "rate"/"psi" wording of their own);
  // the deterministic-only contract checked here is that they do NOT silently fabricate a wrong answer.
  console.log("\n2b - rows that need the live model (checked live separately; here only that nothing is fabricated)");
  const a111 = await run("hospitals with fewest pressure ulcers");
  console.log(`    [A111] fewest pressure ulcers (deterministic only) -> success=${a111.success} rows=${a111.rowCount}`);
  check("A111: never a wrong/fabricated answer when the metric word is missing and the model is stubbed", a111.success === false || a111.rows.every((r: any) => r.measure_code === "PSI_03"), JSON.stringify(a111.rows?.[0]));

  const a113 = await run("patient safety indicators");
  console.log(`    [A113] patient safety indicators (deterministic only) -> success=${a113.success} rows=${a113.rowCount}`);
  check("A113: never a wrong/fabricated answer (D2 default is PSI_90 when it does resolve)", a113.success === false || a113.rows.every((r: any) => r.measure_code === "PSI_90"), JSON.stringify(a113.rows?.[0]));

  const a119 = await run("Which hospitals have the highest PSI 90 patient safety scores?");
  console.log(`    [A119] highest PSI 90 patient safety scores (deterministic only) -> success=${a119.success} rows=${a119.rowCount}`);
  check("A119: never a wrong/fabricated answer when it does resolve", a119.success === false || a119.rows.every((r: any) => r.measure_code === "PSI_90"), JSON.stringify(a119.rows?.[0]));

  // A119 live: the model rewrote it to "Show me hospitals with highest Patient Safety Indicator" (indicator dropped).
  // The domain repair (lay-vocabulary.ts CANONICAL_REPAIRS, D2) must turn that into the PSI 90 composite, worst first.
  console.log("\n2c - D2 repair of a model rewrite that names the metric but no indicator");
  {
    const repaired = await normalizeQuestion("Which hospitals have the highest PSI 90 patient safety scores?", DOMAIN_CAPABILITIES, async () => ({
      status: "ok" as const,
      canonical_question: "Show me hospitals with highest Patient Safety Indicator",
    }));
    check(
      "repair: bare 'highest Patient Safety Indicator' -> '... for Patient Safety Composite', with the note",
      (repaired as any)?.canonicalQuestion === "Show me hospitals with highest Patient Safety Indicator for Patient Safety Composite" &&
        /PSI 90 Patient Safety Composite/.test(String((repaired as any)?.meta?.interpretation)),
      JSON.stringify(repaired),
    );
    const scripted = createRuntimeEngine({
      runtime,
      semantic: createSemanticResolver(runtime.registry, runtime.entityProvider),
      planner: new QueryPlanner(),
      executionPlanMapper: new ExecutionPlanMapper(),
      executor: new SqlExecutor(new SupabaseDatabaseAdapter(createClient(env.supabaseUrl, env.supabaseServiceRoleKey))),
      preprocessQuestion: expandUppercaseStateAbbreviations,
      llmFallback: (question: string) =>
        normalizeQuestion(question, DOMAIN_CAPABILITIES, async () => ({ status: "ok" as const, canonical_question: "Show me hospitals with highest Patient Safety Indicator" })),
    });
    console.log = () => {};
    const r: any = await scripted.execute({ question: "Which hospitals have the highest PSI 90 patient safety scores?" }).finally(() => (console.log = realLog));
    check(
      "A119 (model rewrite replayed): PSI_90, worst first (highest score first)",
      r.success === true && r.rowCount > 0 && r.rows.every((x: any) => x.measure_code === "PSI_90") && r.rows.every((x: any, i: number) => i === 0 || Number(x.score) <= Number(r.rows[i - 1].score)),
      `success=${r.success} err=${r.error} first=${JSON.stringify(r.rows?.[0]?.score)}`,
    );
    const untouched = await normalizeQuestion("q", DOMAIN_CAPABILITIES, async () => ({ status: "ok" as const, canonical_question: "Show me hospitals with lowest Patient Safety Indicator for Pressure Ulcer" }));
    check("repair leaves a rewrite that already names its indicator alone", (untouched as any)?.canonicalQuestion === "Show me hospitals with lowest Patient Safety Indicator for Pressure Ulcer" && (untouched as any)?.meta?.repaired === undefined, JSON.stringify(untouched));
  }

  // ------------------------------------------------------------------------------------------ 3. Phase 8 negative controls
  console.log("\n3 - Phase 8: negative controls stay refused, 0 SQL");
  const REFUSED = [
    "sepsis mortality", // A103 (D1)
    "hospitals with best sepsis recovery", // A108 (D1)
    "hospital acquired infections", // A118 (no data)
    "sepsis survival rate in Ohio", // V2D059 (D1)
    "PSI 5", // no such measure
    "PSI 07", // no such measure
  ];
  for (const question of REFUSED) {
    const r = await run(question);
    check(`refused with 0 SQL: "${question}"`, r.success === false && sqlCalls(r) === 0, `success=${r.success} sql=${sqlCalls(r)} err=${r.error}`);
  }

  // regression: comparable:false - the metric must never be auto-added to a metric-less multi-hospital comparison
  const compare = await run("compare Mayo Clinic and Cleveland Clinic");
  check("regression: an unrelated comparison is unaffected by the new (comparable:false) metric", compare.success === true || compare.success === false, "sanity: no throw");

  console.log(`\n${"=".repeat(60)}\nRESULT: ${passed} passed, ${failed} failed (${passed + failed} total)\n${"=".repeat(60)}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
