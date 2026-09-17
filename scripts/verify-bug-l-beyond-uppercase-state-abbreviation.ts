/**
 * Bug L Beyond (Phase 2, 2026-09-17) — hybrid deterministic uppercase
 * state-abbreviation verification.
 *
 * Runs against a DETERMINISTIC-ONLY engine (preprocessQuestion wired,
 * llmFallback NOT wired) to prove the 5 previously-nationwide-failing
 * compound (typo + abbreviation) cases now resolve without any LLM
 * dependency at all, plus explicit regression guards for the collision
 * risks named in state-abbreviation-preprocessor.ts's own header comment
 * (VA/veterans ownership, lowercase "in"/"or" as ordinary words) and the
 * full existing ACB + Bug L Part A/B battery.
 *
 * Run: npx tsx scripts/verify-bug-l-beyond-uppercase-state-abbreviation.ts
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

// Deterministic-only: preprocessQuestion wired, llmFallback NOT wired.
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

async function expectAllState(id: string, question: string, expectedState: string, expectedOwnershipPrefix?: string) {
  const result = await engine.execute({ question });
  const rows = (result.rows as Record<string, unknown>[]) ?? [];
  const states = [...new Set(rows.map((r) => r["state"]))];
  const allState = rows.length > 0 && states.length === 1 && states[0] === expectedState;
  const allOwnership =
    !expectedOwnershipPrefix || (rows.length > 0 && rows.every((r) => String(r["ownership"] ?? "").startsWith(expectedOwnershipPrefix)));
  console.log(`    [${id}] "${question}" -> success=${result.success} rowCount=${result.rowCount} states=${JSON.stringify(states)}`);
  check(
    id,
    `"${question}" every row is state=${expectedState}${expectedOwnershipPrefix ? ` and ownership~="${expectedOwnershipPrefix}"` : ""}, deterministic (no LLM)`,
    result.success === true && allState && allOwnership,
    `success=${result.success} rowCount=${result.rowCount} states=${JSON.stringify(states)}`,
  );
}

async function main() {
  console.log("=".repeat(100));
  console.log("BUG L BEYOND — UPPERCASE STATE ABBREVIATION — DETERMINISTIC VERIFICATION");
  console.log("=".repeat(100));

  console.log("\n--- The 5 previously-failing compound cases (typo/short-form + uppercase state) ---");
  await expectAllState("B-BEYOND-1", "goverment hospital in CA", "CA", "Government");
  await expectAllState("B-BEYOND-2", "government hospital in CA", "CA", "Government");
  await expectAllState("B-BEYOND-3", "govt hospital in CA", "CA", "Government");
  await expectAllState("B-BEYOND-4", "CA government hospital", "CA", "Government");
  await expectAllState("B-BEYOND-5", "government hospital TX", "TX", "Government");

  console.log("\n--- Phase 2.1: camel-case / lowercase non-colliding state codes (the new fix) ---");
  await expectAllState("REG-CAMEL-CA", "government hospital in Ca", "CA", "Government");
  await expectAllState("REG-LOWER-ca", "government hospital in ca", "CA", "Government");
  await expectAllState("REG-CAMEL-AZ", "Az government hospital", "AZ", "Government");
  await expectAllState("REG-CAMEL-TX", "government hospital in Tx", "TX", "Government");
  await expectAllState("REG-UPPER-OH", "government hospital in OH", "OH", "Government");

  console.log("\n--- Regression: colliding codes (incl. ME/OH/ID/MS/MT, moved here after this fix's own audit found real collisions) must STILL only match exact uppercase ---");
  async function expectNotExpanded(id: string, question: string, wrongState: string) {
    const result = await engine.execute({ question });
    const rows = (result.rows as Record<string, unknown>[]) ?? [];
    const states = [...new Set(rows.map((r) => r["state"]))];
    console.log(`    [${id}] "${question}" -> success=${result.success} rowCount=${result.rowCount} states=${JSON.stringify(states)}`);
    check(
      id,
      `"${question}" must NOT be misread as ${wrongState} (camel/lowercase must not trigger a colliding code)`,
      !(states.length === 1 && states[0] === wrongState),
      `states=${JSON.stringify(states)}`,
    );
  }
  await expectNotExpanded("REG-COLLIDING-CAMEL-IN", "government hospital in In", "IN");
  await expectNotExpanded("REG-COLLIDING-ME", "show me hospital in California", "ME");
  await expectNotExpanded("REG-COLLIDING-OH-TITLECASE", "government hospital in Oh", "OH");

  console.log("\n--- Regression: unaffected existing Bug L Part A/B cases ---");
  await expectAllState("REG-PARTA-1", "goverment hospital in california", "CA", "Government");
  await expectAllState("REG-PARTA-2", "Government hospital in California", "CA", "Government");

  console.log("\n--- Regression: geographic list (no metric) ---");
  const bareCA = await engine.execute({ question: "Show me hospital in CA" });
  const bareCARows = (bareCA.rows as Record<string, unknown>[]) ?? [];
  const bareCAStates = [...new Set(bareCARows.map((r) => r["state"]))];
  console.log(`    [REG-GEO-1] -> success=${bareCA.success} rowCount=${bareCA.rowCount} states=${JSON.stringify(bareCAStates)}`);
  check("REG-GEO-1", "'Show me hospital in CA' -> 100 rows, all CA", bareCA.success === true && bareCA.rowCount === 100 && bareCAStates.length === 1 && bareCAStates[0] === "CA", `rowCount=${bareCA.rowCount} states=${JSON.stringify(bareCAStates)}`);

  console.log("\n--- CRITICAL collision guard: lowercase 'in' as an ordinary preposition must NEVER become Indiana ---");
  const lowercaseIn = await engine.execute({ question: "hospitals in California" });
  const lowercaseInRows = (lowercaseIn.rows as Record<string, unknown>[]) ?? [];
  const lowercaseInStates = [...new Set(lowercaseInRows.map((r) => r["state"]))];
  console.log(`    [REG-COLLISION-1] "hospitals in California" -> success=${lowercaseIn.success} rowCount=${lowercaseIn.rowCount} states=${JSON.stringify(lowercaseInStates)}`);
  check(
    "REG-COLLISION-1",
    "'hospitals in California' resolves to California, NEVER Indiana (lowercase 'in' must not match)",
    lowercaseIn.success === true && lowercaseInStates.length === 1 && lowercaseInStates[0] === "CA",
    `rowCount=${lowercaseIn.rowCount} states=${JSON.stringify(lowercaseInStates)}`,
  );

  console.log("\n--- CRITICAL collision guard: 'VA' must still mean Veterans ownership, not Virginia ---");
  const vaHospital = await engine.execute({ question: "VA hospital in Texas" });
  const vaRows = (vaHospital.rows as Record<string, unknown>[]) ?? [];
  console.log(`    [REG-COLLISION-2] "VA hospital in Texas" -> success=${vaHospital.success} rowCount=${vaHospital.rowCount} sample=${JSON.stringify(vaRows.slice(0, 1))}`);
  check(
    "REG-COLLISION-2",
    "'VA hospital in Texas' still resolves as Veterans-owned hospitals in Texas (not silently redefined to 'Virginia hospital in Texas')",
    vaHospital.success === true && vaRows.every((r) => String(r["ownership"] ?? "").includes("Veterans")) && vaRows.every((r) => r["state"] === "TX"),
    `success=${vaHospital.success} rowCount=${vaHospital.rowCount}`,
  );

  console.log("\n--- Regression: ACB dossier/comparison battery (unrelated to this fix, must stay unaffected) ---");
  const mayo = await engine.execute({ question: "tell me about Mayo Clinic" });
  check("REG-ACB-1", "'tell me about Mayo Clinic' -> 1 row, facility 100151", mayo.success === true && mayo.rowCount === 1 && (mayo.rows as Record<string, unknown>[])[0]?.["facility_id"] === "100151", `success=${mayo.success} rowCount=${mayo.rowCount}`);

  const govTX = await engine.execute({ question: "government hospitals in Texas" });
  check("REG-ACB-2", "'government hospitals in Texas' (spelled out, control) -> ranked top-10, not 100", govTX.success === true && govTX.rowCount === 10, `success=${govTX.success} rowCount=${govTX.rowCount}`);

  const hospitalsTexas = await engine.execute({ question: "hospitals in Texas" });
  check("REG-ACB-3", "'hospitals in Texas' (control, full list) -> 100 rows", hospitalsTexas.success === true && hospitalsTexas.rowCount === 100, `success=${hospitalsTexas.success} rowCount=${hospitalsTexas.rowCount}`);

  const goodSafety = await engine.execute({ question: "show me hospital with good safety" });
  check("REG-BUGL-B", "'good safety' (Bug L Part B, control) unaffected", goodSafety.success === true && goodSafety.rowCount === 10, `success=${goodSafety.success} rowCount=${goodSafety.rowCount}`);

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
