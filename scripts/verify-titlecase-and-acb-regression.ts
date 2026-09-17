/**
 * Phase 2.1 (2026-09-17/18) — comprehensive regression suite covering:
 *   Suite 1: TitleCase/mixed-case postal abbreviations (the new fix)
 *   Suite 2: Bug L baseline controls (must stay PASS)
 *   Suite 3: ACB single-hospital dossiers (must stay PASS)
 *   Suite 4: ACB multi-hospital comparisons (must stay PASS)
 *
 * Runs against a DETERMINISTIC-ONLY engine (preprocessQuestion wired,
 * llmFallback NOT wired) for everything except where a query is known
 * to require the LLM gateway (none of the suites below do - every case
 * here is a deterministic capability).
 *
 * The one Suite-4 case requiring a real two-turn continuation
 * (Turn 1 ambiguous "compare memorial hospital vs Mayo Clinic" -> Turn 2
 * "CARTHAGE") is NOT exercised by this script - the local engine here
 * has no `pending_interactions` table wiring (that only exists in the
 * deployed orchestrator's chat.ts/continuation.ts layer). It is
 * verified separately via a live HTTP round-trip against the deployed
 * function - see the Phase 2.1 fix doc for that evidence.
 *
 * Run: npx tsx scripts/verify-titlecase-and-acb-regression.ts
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

async function expectAllState(id: string, question: string, expectedState: string, expectedOwnershipPrefix?: string) {
  const result = await engine.execute({ question });
  const rows = (result.rows as Record<string, unknown>[]) ?? [];
  const states = [...new Set(rows.map((r) => r["state"]))];
  const allState = rows.length > 0 && states.length === 1 && states[0] === expectedState;
  const allOwnership =
    !expectedOwnershipPrefix || (rows.length > 0 && rows.every((r) => String(r["ownership"] ?? "").startsWith(expectedOwnershipPrefix)));
  console.log(`    [${id}] "${question}" -> success=${result.success} rowCount=${result.rowCount} states=${JSON.stringify(states)}`);
  check(id, `"${question}" all rows state=${expectedState}${expectedOwnershipPrefix ? ` ownership~="${expectedOwnershipPrefix}"` : ""}`, result.success === true && allState && allOwnership, `success=${result.success} rowCount=${result.rowCount} states=${JSON.stringify(states)}`);
}

async function expectDossier(id: string, question: string, expectedRowCount: number, expectedFacilityIds?: string[]) {
  const result = await engine.execute({ question });
  const rows = (result.rows as Record<string, unknown>[]) ?? [];
  const facilityIds = rows.map((r) => r["facility_id"]);
  const facilitiesMatch = !expectedFacilityIds || expectedFacilityIds.every((id2) => facilityIds.includes(id2));
  const hasFullDossier = rows.length > 0 && Object.keys(rows[0]!).length >= 15;
  console.log(`    [${id}] "${question}" -> success=${result.success} rowCount=${result.rowCount} facilityIds=${JSON.stringify(facilityIds)}`);
  check(
    id,
    `"${question}" -> rowCount=${expectedRowCount}, full dossier columns, correct facility_ids`,
    result.success === true && result.rowCount === expectedRowCount && facilitiesMatch && hasFullDossier,
    `success=${result.success} rowCount=${result.rowCount} columns=${rows[0] ? Object.keys(rows[0]).length : 0}`,
  );
}

async function main() {
  console.log("=".repeat(100));
  console.log("PHASE 2.1 — TITLECASE FIX + FULL ACB/BUG-L REGRESSION SUITE");
  console.log("=".repeat(100));

  console.log("\n--- SUITE 1: TitleCase / mixed-case postal abbreviations (the fix) ---");
  await expectAllState("S1-CA-TITLE", "government hospital in Ca", "CA", "Government");
  await expectAllState("S1-AZ-TITLE", "Az government hospital", "AZ", "Government");
  await expectAllState("S1-TX-TITLE", "government hospital in Tx", "TX", "Government");
  await expectAllState("S1-OH-UPPER-ONLY", "government hospital in OH", "OH", "Government"); // OH deliberately uppercase-only (colliding word "oh") - see fix doc

  console.log("\n--- SUITE 2: Bug L baseline controls (must stay PASS) ---");
  await expectAllState("S2-1", "goverment hospital in CA", "CA", "Government");
  await expectAllState("S2-2", "government hospital in CA", "CA", "Government");
  await expectAllState("S2-3", "govt hospital in CA", "CA", "Government");
  await expectAllState("S2-4", "CA government hospital", "CA", "Government");
  const geoCA = await engine.execute({ question: "Show me hospital in CA" });
  check("S2-5", "'Show me hospital in CA' -> 100 rows, full CA list", geoCA.success === true && geoCA.rowCount === 100, `rowCount=${geoCA.rowCount}`);
  const goodSafety = await engine.execute({ question: "show me hospital with good safety" });
  check("S2-6", "'good safety' -> 10 rows, safety_score 100", goodSafety.success === true && goodSafety.rowCount === 10 && (goodSafety.rows as Record<string, unknown>[])[0]?.["safety_score"] === 100, `rowCount=${goodSafety.rowCount}`);
  const goodSaftey = await engine.execute({ question: "show me hospital with good saftey" });
  check("S2-7", "'good saftey' (typo) -> 10 rows, safety_score 100", goodSaftey.success === true && goodSaftey.rowCount === 10, `rowCount=${goodSaftey.rowCount}`);
  const vaTexas = await engine.execute({ question: "VA hospital in Texas" });
  const vaTexasRows = (vaTexas.rows as Record<string, unknown>[]) ?? [];
  check("S2-8", "'VA hospital in Texas' -> Veterans-owned Texas hospitals (not Virginia)", vaTexas.success === true && vaTexasRows.length > 0 && vaTexasRows.every((r) => String(r["ownership"] ?? "").includes("Veterans") && r["state"] === "TX"), `rowCount=${vaTexas.rowCount}`);
  const noIndiana = await engine.execute({ question: "hospitals in California" });
  const noIndianaRows = (noIndiana.rows as Record<string, unknown>[]) ?? [];
  const noIndianaStates = [...new Set(noIndianaRows.map((r) => r["state"]))];
  check("S2-9", "'hospitals in California' -> California, never Indiana", noIndiana.success === true && noIndianaStates.length === 1 && noIndianaStates[0] === "CA", `states=${JSON.stringify(noIndianaStates)}`);

  console.log("\n--- SUITE 3: ACB single-hospital dossiers (must stay PASS) ---");
  await expectDossier("S3-1", "tell me about Mayo Clinic", 1, ["100151"]);
  await expectDossier("S3-2", "tell me about Cleveland Clinic", 1, ["360180"]);
  await expectDossier("S3-3", "ADVENTIST HEALTH HOWARD MEMORIAL", 1, ["051310"]);
  await expectDossier("S3-4", "ADVENTIST HEALTH HOWARD MEMORIAL hospital", 1, ["051310"]);

  console.log("\n--- SUITE 4: ACB multi-hospital comparisons (must stay PASS) ---");
  await expectDossier("S4-1", "compare Mayo Clinic vs Cleveland Clinic", 2, ["100151", "360180"]);
  await expectDossier("S4-2", "compare Mayo Clinic vs Cleveland Clinic vs NYU LANGONE HOSPITALS", 3, ["100151", "360180", "330214"]);

  console.log("\n(Suite 4's continuation/disambiguation case - 'compare memorial hospital vs Mayo");
  console.log(" Clinic' -> Turn 2 'CARTHAGE' -> 2 rows - requires the deployed orchestrator's");
  console.log(" pending_interactions table and is verified separately via live HTTP, not here.)");

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
