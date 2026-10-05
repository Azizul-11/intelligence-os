/** Phase 3 Tasks 3.4/3.5: Bug H is not reproducing (generic rankable-metric default already works); "heart issue" is deliberately NOT fixed (ambiguous between AMI and heart-failure, so an honest refusal); "Huston" fixed via healthcareMisspellingRewrites (geographic-directory.ts is machine-generated). Deterministic engine (no llmFallback).
 * Run: npx tsx scripts/verify-bug-h-j-k-heart-aliases.ts */
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

async function main() {
  console.log("=".repeat(100));
  console.log("BUG H / HEART ALIASES / HUSTON TYPO — DETERMINISTIC VERIFICATION");
  console.log("=".repeat(100));

  console.log("\n--- Bug H: reconfirmed already working (no code change) ---");
  {
    const r = await engine.execute({ question: "California public hospitals and their Patient Experience scores" });
    const rows = (r.rows as Record<string, unknown>[]) ?? [];
    check("H-1", '"California public hospitals and their Patient Experience scores" -> 10 ranked, CA, government ownership', r.success === true && r.rowCount === 10 && rows.every((row) => row["state"] === "CA") && rows.every((row) => String(row["ownership"]).startsWith("Government")), `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "public hospitals in Texas" });
    check("CTRL-H1", '"public hospitals in Texas" (control) -> 10 ranked, unaffected', r.success === true && r.rowCount === 10, `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "readmission rate in Texas" });
    check("CTRL-H2", '"readmission rate in Texas" (generic rankable+state+no-ranking-word) -> 10 ranked', r.success === true && r.rowCount === 10, `success=${r.success} rowCount=${r.rowCount}`);
  }

  console.log("\n--- Heart aliases: deliberately NOT fixed - honest refusal confirmed ---");
  {
    const r = await engine.execute({ question: "show me hospital for heart issue" });
    check("HEART-1", '"show me hospital for heart issue" -> honest refusal, not fabricated', r.success === false && (r.rowCount ?? 0) === 0, `success=${r.success} rowCount=${r.rowCount} error=${(r as any).error}`);
  }
  {
    const r = await engine.execute({ question: "heart attack death rate" });
    check("CTRL-HEART1", '"heart attack death rate" (registered AMI alias, control) -> unaffected', r.success === true && r.rowCount === 10, `success=${r.success} rowCount=${r.rowCount}`);
  }

  console.log("\n--- Huston typo: fixed ---");
  {
    const r = await engine.execute({ question: "show me hospital in Huston, Texas" });
    const rows = (r.rows as Record<string, unknown>[]) ?? [];
    check("HUSTON-1", '"show me hospital in Huston, Texas" -> 28 rows, all Houston TX', r.success === true && r.rowCount === 28 && rows.every((row) => row["city"] === "HOUSTON" && row["state"] === "TX"), `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "show me hospital in Houston, Texas" });
    check("CTRL-HUSTON1", '"show me hospital in Houston, Texas" (correct spelling, control) -> 28 rows, unaffected', r.success === true && r.rowCount === 28, `success=${r.success} rowCount=${r.rowCount}`);
  }

  console.log("\n--- Non-regression: ACB / Bug D / Bug E / Bug F/G / Bug L spot-checks ---");
  {
    const r = await engine.execute({ question: "tell me about Mayo Clinic" });
    check("CTRL-ACB", '"tell me about Mayo Clinic" -> 1 row full dossier', r.success === true && r.rowCount === 1, `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "ADVENTIST HEALTH HOWARD MEMORIAL vs ADVENTHEALTH CASTLE ROCK" });
    check("CTRL-ACB2", '"ADVENTIST HEALTH HOWARD MEMORIAL vs ADVENTHEALTH CASTLE ROCK" -> 2 rows full dossier', r.success === true && r.rowCount === 2, `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "Compare Readmission Rates for Pneumonia in Florida vs Georgia" });
    check("CTRL-BUGD", '"Compare Readmission Rates for Pneumonia in Florida vs Georgia" -> unaffected', r.success === true && r.rowCount === 10, `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "what's the weather in Texas?" });
    check("CTRL-BUGE", '"what\'s the weather in Texas?" -> refused, unaffected', r.success === false && (r.rowCount ?? 0) === 0, `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "safest hospitals in Texas" });
    check("CTRL-BUGF", '"safest hospitals in Texas" -> ranked safety_score, unaffected', r.success === true && r.rowCount === 10, `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "Compare the strongest hospitals in Texas and California." });
    check("CTRL-BUGG", '"Compare the strongest hospitals in Texas and California." -> ranked, unaffected', r.success === true && r.rowCount === 10, `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "government hospital in Ca" });
    const rows = (r.rows as Record<string, unknown>[]) ?? [];
    check("CTRL-BUGL", '"government hospital in Ca" (camel-case) -> unaffected', r.success === true && r.rowCount === 10 && rows.every((row) => row["state"] === "CA"), `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "hospitals in California" });
    const rows = (r.rows as Record<string, unknown>[]) ?? [];
    check("CTRL-BUGL2", '"hospitals in California" -> never Indiana (collision guard), unaffected', r.success === true && r.rowCount === 100 && rows.every((row) => row["state"] === "CA"), `success=${r.success} rowCount=${r.rowCount}`);
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
