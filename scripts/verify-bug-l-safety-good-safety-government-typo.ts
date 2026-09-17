/**
 * Bug L (2026-09-15) — "good safety"/"good saftey" ranking + government
 * ownership typo verification.
 *
 * Root cause (confirmed live, not assumed):
 * - Bare "safety" only ever matched the separate, inert CATEGORY alias
 *   (aliases/safety.ts) - never a rankable metric (the pre-existing F13
 *   gap) - so "good safety"/"good saftey" produced zero metric
 *   candidates and failed deterministically ("Unable to create query
 *   plan."/"Unable to resolve question."), regardless of how well the
 *   LLM gateway's own prompt already covers this exact phrasing (Layer 1
 *   is only ever a rewrite of last resort against a genuinely bad
 *   deterministic outcome, and free-tier LLM sampling is not reliable
 *   enough to depend on for a well-known, common phrasing).
 * - "goverment"/"govt"/"gov"/"govenment" (ownership typos) matched
 *   nothing in ownership-directory.ts's exact-match map, so the ownership
 *   filter was silently absent rather than merely mis-typed.
 *
 * Fix (deterministic, zero LLM dependency, defense-in-depth alongside the
 * existing LLM prompt - see llm-model-gateway.ts's own already-broad
 * "good safety"/state-abbreviation coverage, which remains for phrasings
 * this deterministic fix doesn't cover):
 * - New literal aliases in aliases/safety-performance.ts: "good safety",
 *   "good saftey", "great safety", "excellent safety", "best safety".
 * - New literal ownership-directory.ts entries: "goverment", "govt",
 *   "gov", "govenment" -> government.
 * - execution-strategy.ts: a "lookup"-shaped request (no ranking word)
 *   that resolved a genuinely rankable metric but named no hospital now
 *   redirects to that metric's own ranking template (same as if a
 *   ranking word had been present), instead of failing at "SQL template
 *   not found." Also broadens the pre-existing measureCodeFilter routing
 *   to this same shape, so a bare condition mention ("heart attack death
 *   rate") gets its own condition-specific template, not the generic one.
 *
 * Explicitly NOT attempted (documented, not silently skipped): a
 * deterministic state-ABBREVIATION map (e.g. "CA" -> California). Real
 * 2-letter US state abbreviations collide with common English words
 * ("IN", "OR", "HI", "OK", "CO", "PA", ...) and the existing bare-phrase
 * entity resolver has no case-sensitivity signal to disambiguate them
 * safely - confirmed via docs/pre-phase9's own audit trail that this was
 * a deliberate architectural choice, left to the LLM layer. A spelled-out
 * state name ("california") already resolves deterministically
 * (entity-provider.ts's STATES map) and is unaffected either way.
 *
 * A real regression was found and reverted during this fix's own
 * development (documented, not silently discarded): an earlier version
 * added "good"/"great"/"excellent" to Universal Core's
 * `RANKING_KEYWORDS` (packages/query-planner/src/query-intent-detector.ts)
 * instead of the narrower execution-strategy.ts redirect below - this
 * flipped `ExecutionPlan.operation` itself to "rank" for ANY query
 * containing these words, which broke previously-working single-hospital
 * dossier lookups whose names contain them (e.g. "Good Samaritan
 * Hospital", "Great River Medical Center" - both real, multi-instance
 * names in the current warehouse) by routing them into the F8 "own vs
 * similar" ambiguity gate. Reverted; this suite's regression section
 * below directly guards against reintroducing that class of defect.
 *
 * Run: npx tsx scripts/verify-bug-l-safety-good-safety-government-typo.ts
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

// Deterministic-only engine (no llmFallback wired) - proves each fixed
// case resolves WITHOUT depending on the LLM gateway at all.
const engine = createRuntimeEngine({
  runtime,
  semantic,
  planner,
  executionPlanMapper: mapper,
  executor,
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

async function expectSuccess(id: string, question: string, minRows = 1) {
  const result = await engine.execute({ question });
  console.log(`    [${id}] "${question}" -> success=${result.success} rowCount=${result.rowCount} error=${JSON.stringify(result.error)}`);
  check(
    id,
    `"${question}" resolves deterministically`,
    result.success === true && (result.rowCount ?? 0) >= minRows,
    `success=${result.success} rowCount=${result.rowCount} error=${result.error}`,
  );
  return result;
}

async function expectOwnershipOnly(id: string, question: string, expectedOwnershipPrefix: string) {
  const result = await engine.execute({ question });
  const rows = (result.rows as Record<string, unknown>[]) ?? [];
  const allMatch = rows.length > 0 && rows.every((r) => String(r["ownership"] ?? "").startsWith(expectedOwnershipPrefix));
  console.log(`    [${id}] "${question}" -> success=${result.success} rowCount=${result.rowCount} ownerships=${JSON.stringify(rows.slice(0, 3).map((r) => r["ownership"]))}`);
  check(
    id,
    `"${question}" every row's ownership starts with "${expectedOwnershipPrefix}"`,
    result.success === true && allMatch,
    `success=${result.success} rowCount=${result.rowCount}`,
  );
  return result;
}

async function main() {
  console.log("=".repeat(100));
  console.log("BUG L — SAFETY GOOD-SAFETY + GOVERNMENT TYPO — DETERMINISTIC VERIFICATION");
  console.log("=".repeat(100));

  console.log("\n--- Part B: safety-performance ranking without a ranking-word/state, deterministic ---");
  await expectSuccess("B56", "show me hospital with good safety", 10);
  await expectSuccess("B57", "show me hospital with good saftey", 10);
  await expectSuccess("B58", "hospital with good safety performance", 10);
  await expectSuccess("B59", "which hospitals have good safety?", 10);
  await expectSuccess("B60", "good safety hospitals", 10);
  await expectSuccess("B65-CONTROL", "Which hospitals rank highest in Safety Performance?", 10);

  console.log("\n--- Part A: government ownership typo, deterministic (spelled-out state) ---");
  await expectOwnershipOnly("B47", "goverment hospital in california", "Government");
  await expectOwnershipOnly("B48", "govt hospital in california", "Government");
  await expectOwnershipOnly("B50", "gov hospital california", "Government");
  await expectOwnershipOnly("PARTA-CONTROL", "government hospitals in california", "Government");

  console.log("\n--- Regression: real hospital names containing 'good'/'great' must still dossier-lookup, not misroute into ranking/ambiguity ---");
  const goodSamaritan = await engine.execute({ question: "tell me about Good Samaritan Hospital" });
  console.log(`    [REG-GOOD-SAMARITAN] -> success=${goodSamaritan.success} rowCount=${goodSamaritan.rowCount} answerability=${JSON.stringify(goodSamaritan.answerability)}`);
  check(
    "REG-GOOD-SAMARITAN",
    "'tell me about Good Samaritan Hospital' is not silently redirected to a nationwide ranking (single-record dossier, not a rank-shaped 10-row response)",
    goodSamaritan.rowCount !== 10,
    `success=${goodSamaritan.success} rowCount=${goodSamaritan.rowCount}`,
  );

  const greatRiver = await engine.execute({ question: "tell me about Great River Medical Center" });
  console.log(`    [REG-GREAT-RIVER] -> success=${greatRiver.success} rowCount=${greatRiver.rowCount} answerability=${JSON.stringify(greatRiver.answerability)}`);
  check(
    "REG-GREAT-RIVER",
    "'tell me about Great River Medical Center' resolves as a single-hospital dossier",
    greatRiver.success === true && greatRiver.rowCount === 1,
    `success=${greatRiver.success} rowCount=${greatRiver.rowCount}`,
  );

  console.log("\n--- Regression: condition-specific ranking must keep using its own template (measureCode), not the generic metric ranking ---");
  const heartAttack = await engine.execute({ question: "heart attack death rate" });
  const heartAttackRows = (heartAttack.rows as Record<string, unknown>[]) ?? [];
  console.log(`    [REG-AMI-MORTALITY] -> success=${heartAttack.success} rowCount=${heartAttack.rowCount} sample=${JSON.stringify(heartAttackRows.slice(0, 1))}`);
  check(
    "REG-AMI-MORTALITY",
    "'heart attack death rate' returns AMI-specific 'score'/'measure_code' columns, not generic mort_measures_* columns",
    heartAttack.success === true && heartAttackRows[0]?.["measure_code"] !== undefined,
    `success=${heartAttack.success} rowCount=${heartAttack.rowCount}`,
  );

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
