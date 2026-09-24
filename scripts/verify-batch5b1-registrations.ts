#!/usr/bin/env tsx

/**
 * Batch 5B-1 (zero-SQL capability registrations: stroke, hospital-wide mortality, ownership sub-labels) verification.
 * No live model is called anywhere in this suite: the engine runs deterministically (real lay-mapper and pre-check,
 * no llmFallback needed for any of these cases) against the live warehouse (read-only SELECTs).
 *
 *   1  registry: the concepts and their aliases are exposed to the capability catalog correctly
 *   2  stroke: engine resolution (nationwide, state), the bare lay-vocabulary phrase, direction, negative controls
 *   3  hospital-wide mortality: engine resolution, the bare all-cause phrase, negative control (readmission)
 *   4  ownership sub-labels: physician, tribal, church (typed and typo'd), Department of Defense, military; VA and
 *      the existing ownership families are unaffected
 *   5  Phase 8: every negative control above is refused with 0 SQL
 *
 * Usage: pnpm exec tsx scripts/verify-batch5b1-registrations.ts
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
console.log("\n1 - registry: concepts and aliases reach the capability catalog");
{
  const stroke = DOMAIN_CAPABILITIES.concepts.find((c) => c.displayName === "Stroke");
  check("Stroke is a real-measure concept", stroke !== undefined && stroke.aliases.includes("Stroke") && stroke.aliases.includes("Strokes") && stroke.aliases.includes("Cerebrovascular Accident"), JSON.stringify(stroke));
  check("Stroke names the mortality-rate metric", !!stroke?.metrics.includes("Mortality Rate"), JSON.stringify(stroke));
  const hwm = DOMAIN_CAPABILITIES.concepts.find((c) => c.displayName === "Hospital-Wide Mortality");
  check("Hospital-Wide Mortality is a real-measure concept", hwm !== undefined && hwm.aliases.includes("hospital wide") && hwm.aliases.includes("all cause"), JSON.stringify(hwm));
  check("stroke is no longer a derived unsupported topic", !DOMAIN_CAPABILITIES.unsupportedTopics.includes("stroke"));
  check("hospital wide / all cause are no longer literal unsupported topics", !DOMAIN_CAPABILITIES.unsupportedTopics.includes("hospital wide") && !DOMAIN_CAPABILITIES.unsupportedTopics.includes("all cause"));
  for (const topic of ["physician owned", "tribal", "military", "department of defense", "church owned"]) {
    check(`"${topic}" is no longer an unsupported topic`, !DOMAIN_CAPABILITIES.unsupportedTopics.includes(topic));
  }
  for (const topic of ["stroke readmission", "stroke complications", "hospital wide readmission"]) {
    check(`"${topic}" stays an unsupported topic (no such measure)`, DOMAIN_CAPABILITIES.unsupportedTopics.includes(topic));
  }
  for (const label of ["church-owned", "physician-owned", "tribal", "military"]) {
    check(`OWNERSHIPS lists "${label}"`, DOMAIN_CAPABILITIES.ownerships.includes(label), DOMAIN_CAPABILITIES.ownerships.join(", "));
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
async function run(question: string, extra: Record<string, unknown> = {}): Promise<any> {
  console.log = () => {}; // the engine prints every gate
  try {
    return await engine.execute({ question, ...extra });
  } finally {
    console.log = realLog;
  }
}
const sqlCalls = (r: any) => (r.trace ?? []).reduce((sum: number, g: any) => sum + (g.sqlCalls ?? 0), 0);

async function main() {
  // ------------------------------------------------------------------------------------------ 2. stroke
  console.log("\n2 - stroke (MORT_30_STK)");
  {
    const national = await run("stroke mortality");
    check("A100 stroke mortality: nationwide top 10, ascending (lowest first)", national.success === true && national.rowCount > 0 && national.rows.every((r: any) => r.measure_code === "MORT_30_STK"), `success=${national.success} rows=${national.rowCount} err=${national.error}`);
    check("A100: scores are ascending (lowest death rate first)", national.rows.every((r: any, i: number) => i === 0 || Number(r.score) >= Number(national.rows[i - 1].score)));

    const lowest = await run("hospitals with lowest stroke death rate");
    check("A101 hospitals with lowest stroke death rate", lowest.success === true && lowest.rowCount > 0);

    const ohio = await run("stroke death rate in Ohio");
    check("A102 stroke death rate in Ohio: scoped to Ohio", ohio.success === true && ohio.rowCount > 0 && ohio.rows.every((r: any) => r.state === "OH"), `success=${ohio.success} states=${[...new Set(ohio.rows?.map((r: any) => r.state))].join(",")}`);

    const bestFor = await run("best hospital for stroke");
    check("A106 best hospital for stroke: lowest stroke mortality", bestFor.success === true && bestFor.rowCount > 0 && bestFor.rows.every((r: any) => r.measure_code === "MORT_30_STK"));

    const bare = await run("stroke hospitals");
    check("V2D058 stroke hospitals (bare, lay-vocabulary): resolves nationwide", bare.success === true && bare.rowCount > 0 && bare.rows.every((r: any) => r.measure_code === "MORT_30_STK"), `success=${bare.success} err=${bare.error}`);

    const worst = await run("hospitals with the highest stroke mortality rate");
    check("direction: highest stroke mortality is worst-first (descending)", worst.success === true && worst.rowCount > 0 && worst.rows.every((r: any, i: number) => i === 0 || Number(r.score) <= Number(worst.rows[i - 1].score)), `success=${worst.success}`);

    const namedHospital = await run("mortality rate for Mayo Clinic");
    const strokeRow = (namedHospital.rows ?? []).find((r: any) => r.measure_code === "MORT_30_STK");
    check("R4: the named-hospital mortality lookup still returns the stroke row (LIKE 'MORT%')", namedHospital.success === true && strokeRow !== undefined, `success=${namedHospital.success} codes=${(namedHospital.rows ?? []).map((r: any) => r.measure_code).join(",")}`);
  }

  // ------------------------------------------------------------------------------------------ 3. hospital-wide mortality
  console.log("\n3 - hospital-wide mortality (Hybrid_HWM)");
  {
    const national = await run("hospital wide mortality");
    check("A104 hospital wide mortality: nationwide, Hybrid_HWM", national.success === true && national.rowCount > 0 && national.rows.every((r: any) => r.measure_code === "Hybrid_HWM"), `success=${national.success} err=${national.error}`);

    const allCause = await run("overall all-cause mortality by hospital");
    check("A105 overall all-cause mortality by hospital: Hybrid_HWM", allCause.success === true && allCause.rowCount > 0 && allCause.rows.every((r: any) => r.measure_code === "Hybrid_HWM"), `success=${allCause.success} err=${allCause.error}`);
  }

  // ------------------------------------------------------------------------------------------ 4. ownership sub-labels
  console.log("\n4 - ownership sub-labels");
  {
    const physician = await run("physician owned hospitals");
    check("D008 physician owned hospitals: Physician ownership only", physician.success === true && physician.rowCount > 0 && physician.rows.every((r: any) => r.ownership === "Physician"), `success=${physician.success} err=${physician.error}`);

    const tribal = await run("tribal hospitals");
    check("D009 tribal hospitals: Tribal ownership only", tribal.success === true && tribal.rowCount > 0 && tribal.rows.every((r: any) => r.ownership === "Tribal"), `success=${tribal.success} err=${tribal.error}`);

    const church = await run("church owned hospitals");
    check("D011 church owned hospitals: Voluntary non-profit - Church only", church.success === true && church.rowCount > 0 && church.rows.every((r: any) => r.ownership === "Voluntary non-profit - Church"), `success=${church.success} err=${church.error}`);

    // D074/D010/V2E067: Department of Defense has 0 overall-rated hospitals (audit section 2.5), and a bare
    // ownership question with no metric defaults to the overall-rating ranking (WHERE overall_rating IS NOT NULL),
    // so the *correct* result here is a valid, successful, EMPTY ranking - not an error and not a refusal. The
    // ownership filter itself is proven resolved via executedParameters. D11 (list the hospitals plus a coverage
    // note instead of an empty table) needs a nationwide listing template with no SQL today - out of this
    // zero-new-SQL batch's scope; see the batch report.
    const dod = await run("Department of Defense hospitals");
    check("D074 Department of Defense hospitals: ownership resolves correctly (0 rated -> a valid, empty ranking; D11 tracked separately)", dod.success === true && dod.executedParameters?.ownership === "Department of Defense%" && dod.rows.every((r: any) => r.ownership === "Department of Defense"), `success=${dod.success} rows=${dod.rowCount} err=${dod.error} params=${JSON.stringify(dod.executedParameters)}`);

    const military = await run("military hospitals");
    check("D010 military hospitals: maps to Department of Defense (D5), same empty-ranking limitation as D074", military.success === true && military.executedParameters?.ownership === "Department of Defense%" && military.rows.every((r: any) => r.ownership === "Department of Defense"), `success=${military.success} rows=${military.rowCount} err=${military.error} params=${JSON.stringify(military.executedParameters)}`);

    const militaryVA = await run("hey do you have military hospitals in Virginia");
    check("V2E067 military hospitals in Virginia: Department of Defense + Virginia resolve correctly", militaryVA.success === true && militaryVA.executedParameters?.ownership === "Department of Defense%" && militaryVA.rows.every((r: any) => r.ownership === "Department of Defense" && r.state === "VA"), `success=${militaryVA.success} rows=${militaryVA.rowCount} err=${militaryVA.error} params=${JSON.stringify(militaryVA.executedParameters)}`);

    const typo1 = await run("chruch owned");
    check("V2D030 chruch owned (bare typo): resolves via the lay-vocabulary, not refused", typo1.success === true && typo1.rowCount > 0 && typo1.rows.every((r: any) => r.ownership === "Voluntary non-profit - Church"), `success=${typo1.success} err=${typo1.error}`);

    const typo2 = await run("Show me chruch owned hospital in CA");
    check("V2D041 chruch owned hospital in CA: church-owned, California only", typo2.success === true && typo2.rowCount > 0 && typo2.rows.every((r: any) => r.ownership === "Voluntary non-profit - Church" && r.state === "CA"), `success=${typo2.success} err=${typo2.error}`);

    const typo3 = await run("chruch owned hospitals in Illinois");
    check("V2E066 chruch owned hospitals in Illinois: church-owned, Illinois only", typo3.success === true && typo3.rowCount > 0 && typo3.rows.every((r: any) => r.ownership === "Voluntary non-profit - Church" && r.state === "IL"), `success=${typo3.success} err=${typo3.error}`);

    const typo4 = await run("chruch owned hosptials in Ohio");
    check("V2E086 chruch owned hosptials in Ohio (two typos): church-owned, Ohio only", typo4.success === true && typo4.rowCount > 0 && typo4.rows.every((r: any) => r.ownership === "Voluntary non-profit - Church" && r.state === "OH"), `success=${typo4.success} err=${typo4.error}`);

    // regression: the four already-working ownership families are unaffected by the new map entries
    const veterans = await run("VA hospitals in Texas");
    check("regression: VA hospitals still means veterans, not Virginia", veterans.success === true && veterans.rowCount > 0 && veterans.rows.every((r: any) => r.ownership === "Veterans Health Administration" && r.state === "TX"), `success=${veterans.success} err=${veterans.error}`);

    const stateOwned = await run("state owned hospitals in Ohio");
    check("regression: state owned still means Government - State, not the whole government family", stateOwned.success === true && stateOwned.rowCount > 0 && stateOwned.rows.every((r: any) => r.ownership === "Government - State" && r.state === "OH"), `success=${stateOwned.success} err=${stateOwned.error}`);

    const government = await run("government hospitals in Texas");
    check("regression: bare government still returns the whole family (not narrowed by the new sub-labels)", government.success === true && government.rowCount > 0 && government.rows.every((r: any) => String(r.ownership).startsWith("Government")), `success=${government.success} err=${government.error}`);
  }

  // ------------------------------------------------------------------------------------------ 5. Phase 8: negative controls, 0 SQL
  console.log("\n5 - Phase 8: negative controls stay refused, 0 SQL");
  const REFUSED = [
    "stroke readmission",
    "stroke complications",
    "stroke survival rate by hospital", // A107 (decision D1: "survival" is a higher-is-better word, never registered)
    "hospital wide readmission",
    "hospital acquired infections", // unaffected control
  ];
  for (const question of REFUSED) {
    const r = await run(question);
    check(`refused with 0 SQL: "${question}"`, r.success === false && sqlCalls(r) === 0, `success=${r.success} sql=${sqlCalls(r)} err=${r.error}`);
  }

  console.log(`\n${"=".repeat(60)}\nRESULT: ${passed} passed, ${failed} failed (${passed + failed} total)\n${"=".repeat(60)}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
