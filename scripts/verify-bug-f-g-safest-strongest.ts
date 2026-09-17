/**
 * Bugs F/G (Phase 3.3, 2026-09-18) - "safest"/"strongest" superlatives
 * silently returning an unranked, wrong-metric result.
 *
 * Bug F root cause: "safest" never resolved to any metric alias (unlike
 * "good safety"/"safety score"/etc.) - "safest hospitals in Texas" left
 * only the non-rankable "hospital-list" metric candidate, silently
 * returning an unranked 100-row list instead of ranking by
 * safety-performance's own safety_score.
 * Fix: registered "safest" as a literal alias in
 * domain-packs/healthcare/src/aliases/safety-performance.ts (same
 * plain phrase-to-canonical-id mechanism every other alias in that
 * file already uses - "safest" is not a registered MODIFIER, so it
 * survives phrase extraction and needs no LexicalRewriter change).
 *
 * Bug G root cause: "strongest" was missing from Universal Core's
 * RANKING_KEYWORDS (packages/query-planner/src/query-intent-detector.ts)
 * - a query also containing "compare"/"vs" succeeds deterministically
 * via COMPARISON_KEYWORDS before Layer 1's LLM rewrite (which does
 * normalize "strongest" -> "best") ever gets a chance to run.
 * Fix: added "strongest" to RANKING_KEYWORDS. Deliberately did NOT also
 * add "strong" (suggested in the Round 6 audit's own fix plan) - a real
 * collision was found ("STRONG MEMORIAL HOSPITAL" in
 * hospital-identity-directory.ts), the same class of regression as
 * gotcha 3 (good/great vs "Good Samaritan"/"Great River").
 *
 * Run against a DETERMINISTIC-ONLY engine (no llmFallback) to prove
 * both fixes work with zero LLM dependency.
 *
 * Run: npx tsx scripts/verify-bug-f-g-safest-strongest.ts
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

async function main() {
  console.log("=".repeat(100));
  console.log("BUGS F/G — SAFEST/STRONGEST — DETERMINISTIC VERIFICATION");
  console.log("=".repeat(100));

  console.log("\n--- Bug F: safest -> ranked by safety_score, not unranked overall_rating ---");
  {
    const r = await engine.execute({ question: "safest hospitals in Texas" });
    const rows = (r.rows as Record<string, unknown>[]) ?? [];
    console.log(`    "safest hospitals in Texas" -> success=${r.success} rowCount=${r.rowCount} firstRow=${JSON.stringify(rows[0])}`);
    check("F-1", '"safest hospitals in Texas" -> 10 rows, ranked by safety_score', r.success === true && r.rowCount === 10 && rows[0] !== undefined && "safety_score" in (rows[0] as object), `success=${r.success} rowCount=${r.rowCount} row0Keys=${rows[0] ? Object.keys(rows[0]) : []}`);
  }
  {
    const r = await engine.execute({ question: "I'm interested in the safest hospitals in California" });
    const rows = (r.rows as Record<string, unknown>[]) ?? [];
    check("F-2", '"I\'m interested in the safest hospitals in California" -> ranked safety_score, CA', r.success === true && r.rowCount === 10 && rows.every((row) => row["state"] === "CA"), `success=${r.success} rowCount=${r.rowCount}`);
  }

  console.log("\n--- Bug F control: existing working phrasing must stay PASS ---");
  {
    const r = await engine.execute({ question: "which hospitals rank highest in Safety Performance?" });
    check("CTRL-F1", '"which hospitals rank highest in Safety Performance?" -> unaffected', r.success === true && r.rowCount === 10, `success=${r.success} rowCount=${r.rowCount}`);
  }

  console.log("\n--- Bug G: strongest -> ranked comparison, not unranked ---");
  {
    const r = await engine.execute({ question: "Compare the strongest hospitals in Texas and California." });
    const rows = (r.rows as Record<string, unknown>[]) ?? [];
    const states = new Set(rows.map((row) => row["state"]));
    console.log(`    "Compare the strongest hospitals in Texas and California." -> success=${r.success} rowCount=${r.rowCount} states=${JSON.stringify([...states])}`);
    check("G-1", '"Compare the strongest hospitals in Texas and California." -> 10 ranked rows, TX+CA only', r.success === true && r.rowCount === 10 && [...states].every((s) => s === "TX" || s === "CA"), `success=${r.success} rowCount=${r.rowCount} states=${JSON.stringify([...states])}`);
  }
  {
    const r = await engine.execute({ question: "Give me the strongest hospitals in California" });
    const rows = (r.rows as Record<string, unknown>[]) ?? [];
    check("G-2", '"Give me the strongest hospitals in California" -> 10 ranked rows, all CA', r.success === true && r.rowCount === 10 && rows.every((row) => row["state"] === "CA"), `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "Which places have the strongest patient experience?" });
    check("G-3", '"Which places have the strongest patient experience?" -> ranked patient-experience', r.success === true && r.rowCount === 10, `success=${r.success} rowCount=${r.rowCount}`);
  }

  console.log("\n--- Bug G control: existing working phrasing must stay PASS ---");
  {
    const r = await engine.execute({ question: "best hospitals in Texas and California" });
    check("CTRL-G1", '"best hospitals in Texas and California" -> unaffected', r.success === true && r.rowCount === 10, `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    // "STRONG MEMORIAL HOSPITAL" must NOT be flipped into a "rank"
    // operation merely for containing the substring "strong" - this is
    // exactly why "strong" (bare) was deliberately not added.
    const r = await engine.execute({ question: "tell me about Strong Memorial Hospital" });
    check("CTRL-G2", '"tell me about Strong Memorial Hospital" -> single-hospital dossier, not ranking-gated', r.success === true && r.rowCount === 1, `success=${r.success} rowCount=${r.rowCount}`);
  }

  console.log("\n--- Non-regression: ACB / Bug D / Bug E / Bug L spot-checks ---");
  {
    const r = await engine.execute({ question: "tell me about Mayo Clinic" });
    check("CTRL-ACB", '"tell me about Mayo Clinic" -> 1 row full dossier', r.success === true && r.rowCount === 1, `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "Compare Readmission Rates for Pneumonia in Florida vs Georgia" });
    const rows = (r.rows as Record<string, unknown>[]) ?? [];
    const measureCodes = [...new Set(rows.map((row) => row["measure_code"]))];
    check("CTRL-BUGD", '"Compare Readmission Rates for Pneumonia in Florida vs Georgia" -> condition-specific, unaffected', r.success === true && r.rowCount === 10 && measureCodes.length === 1 && measureCodes[0] === "READM-30-PN-HRRP", `success=${r.success} rowCount=${r.rowCount} measureCodes=${JSON.stringify(measureCodes)}`);
  }
  {
    const r = await engine.execute({ question: "what's the weather in Texas?" });
    check("CTRL-BUGE", '"what\'s the weather in Texas?" -> refused, unaffected', r.success === false && (r.rowCount ?? 0) === 0, `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "government hospital in Ca" });
    const rows = (r.rows as Record<string, unknown>[]) ?? [];
    check("CTRL-BUGL", '"government hospital in Ca" (camel-case) -> unaffected', r.success === true && r.rowCount === 10 && rows.every((row) => row["state"] === "CA"), `success=${r.success} rowCount=${r.rowCount}`);
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
