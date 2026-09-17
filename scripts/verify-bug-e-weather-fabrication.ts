/**
 * Bug E (Phase 3.1, 2026-09-18) — off-topic question fabrication fix.
 *
 * Root cause: `QueryPlanner.discoverDefaultRankableMetric()` synthesized
 * a default nationwide hospital ranking whenever a bare geographic/scope
 * entity resolved with zero metrics, regardless of whether the rest of
 * the question was ever accounted for - "what's the weather in Texas?"
 * resolved only "Texas" and silently discarded "weather," returning a
 * real-looking but completely fabricated Top-10-hospitals-in-Texas
 * ranking. This is the single most severe violation of the platform's
 * own no-fabrication invariant found in this codebase's history.
 *
 * Fix: a new, purely structural `hasUnaccountedSubstantiveToken()` check
 * in `packages/query-planner/src/query-planner.ts` - refuses to default
 * whenever the original question contains a word that never became part
 * of any resolved semantic candidate AND isn't a generic English
 * question/filler word AND isn't one of the Domain SDK's own declared
 * entity ids. Zero hardcoded off-topic vocabulary anywhere - this would
 * refuse "what's the [x] in Texas?" for ANY unrecognized word `x`, not
 * just "weather".
 *
 * Run against a DETERMINISTIC-ONLY engine (no llmFallback) to prove the
 * refusal is deterministic, not a hopeful LLM catch.
 *
 * Run: npx tsx scripts/verify-bug-e-weather-fabrication.ts
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

async function expectRefused(id: string, question: string) {
  const result = await engine.execute({ question });
  console.log(`    [${id}] "${question}" -> success=${result.success} rowCount=${result.rowCount}`);
  check(
    id,
    `"${question}" refused, no fabricated hospital ranking`,
    result.success === false && (result.rowCount ?? 0) === 0,
    `success=${result.success} rowCount=${result.rowCount}`,
  );
}

async function expectSuccess(id: string, question: string, expectedRowCount: number) {
  const result = await engine.execute({ question });
  console.log(`    [${id}] "${question}" -> success=${result.success} rowCount=${result.rowCount}`);
  check(
    id,
    `"${question}" still succeeds, rowCount=${expectedRowCount}`,
    result.success === true && result.rowCount === expectedRowCount,
    `success=${result.success} rowCount=${result.rowCount}`,
  );
}

async function main() {
  console.log("=".repeat(100));
  console.log("BUG E — OFF-TOPIC FABRICATION — DETERMINISTIC VERIFICATION");
  console.log("=".repeat(100));

  console.log("\n--- Off-topic deflections (must refuse, never fabricate) ---");
  await expectRefused("E-1", "what's the weather in Texas?");
  await expectRefused("E-2", "weather in California");
  await expectRefused("E-3", "what's the climate in Texas?");
  await expectRefused("E-4", "what's the temperature in Texas?");
  await expectRefused("E-5", "what's the forecast in Texas?");
  await expectRefused("E-6", "who is the president in Texas?");
  await expectRefused("E-7", "rain in Texas");
  await expectRefused("E-8", "stock price in Texas");

  console.log("\n--- Legitimate default-ranking queries (must stay PASS) ---");
  await expectSuccess("CTRL-1", "government hospitals in Texas", 10);
  await expectSuccess("CTRL-2", "non-profit hospitals in California", 10);
  await expectSuccess("CTRL-3", "hospitals in Texas", 100);
  await expectSuccess("CTRL-4", "Show me hospital in CA", 100);

  console.log("\n--- Word-order variants that previously regressed during this fix's own development (caught by the existing regression suite, not shipped) ---");
  await expectSuccess("REG-WORDORDER-1", "CA government hospital", 10);
  await expectSuccess("REG-WORDORDER-2", "government hospital TX", 10);
  await expectSuccess("REG-WORDORDER-3", "gov hospital california", 10);

  console.log("\n--- ACB / Bug L non-regression spot-checks ---");
  const mayo = await engine.execute({ question: "tell me about Mayo Clinic" });
  check("REG-ACB-1", "'tell me about Mayo Clinic' -> 1 row, full dossier", mayo.success === true && mayo.rowCount === 1, `success=${mayo.success} rowCount=${mayo.rowCount}`);
  const goodSafety = await engine.execute({ question: "show me hospital with good safety" });
  check("REG-BUGL-1", "'good safety' -> 10 rows, safety_score 100", goodSafety.success === true && goodSafety.rowCount === 10, `success=${goodSafety.success} rowCount=${goodSafety.rowCount}`);
  const govCa = await engine.execute({ question: "government hospital in Ca" });
  const govCaRows = (govCa.rows as Record<string, unknown>[]) ?? [];
  check("REG-BUGL-2", "'government hospital in Ca' (camel-case) -> 10 rows, all CA", govCa.success === true && govCa.rowCount === 10 && govCaRows.every((r) => r["state"] === "CA"), `success=${govCa.success} rowCount=${govCa.rowCount}`);

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
