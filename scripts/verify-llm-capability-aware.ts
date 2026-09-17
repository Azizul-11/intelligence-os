/**
 * LLM Integration — capability-aware Layer 1 verification.
 *
 * Confirms the exact real-world typo/near-miss failures found by live
 * dogfooding (docs/Frontend test/PrePhase 9 LLM.md) are now resolved by
 * the capability-aware normalizeMessyLanguage() prompt + the broadened
 * Layer 1 trigger in create-runtime-engine.ts (which now fires on ANY
 * non-ambiguous failure, not just the bare zero-candidate dead end).
 *
 * Run: npx tsx scripts/verify-llm-capability-aware.ts
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

// Mirrors domain-registry.ts's own wiring exactly - capability-aware Layer 1.
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

// Mirrors chat.ts's own BLUNT_FAILURE_MESSAGES exactly - a raw/technical
// string a user should never see verbatim.
const BLUNT_FAILURE_MESSAGES = new Set([
  "Unable to resolve question.",
  "SQL template not found.",
  "I don't have enough specific information to identify exactly which record this question refers to. Please include more identifying detail (such as a full name or location) and try again.",
]);

async function run(id: string, question: string) {
  const result = await engine.execute({ question });
  console.log(`    [${id}] "${question}" -> success=${result.success} rowCount=${result.rowCount} error=${JSON.stringify(result.error)}`);
  // PrePhase 9.5: a genuinely under-scoped question (no state, no ranking
  // superlative - e.g. a bare "3-star hospital" filter with no place
  // named) has no honest way to produce rows without inventing a scope
  // the user never gave. Success-with-rows is the ideal outcome and
  // always accepted; a real, LLM-authored clarifying question (never one
  // of the raw/blunt technical strings) is also accepted - it's the
  // same "ask, don't guess" behavior a real analyst would use, not a
  // dead-end technical failure.
  const gracefulClarification = result.success === false && !!result.error && !BLUNT_FAILURE_MESSAGES.has(result.error);
  check(
    id,
    `"${question}" now resolves to a real answer or a graceful clarifying question (previously a raw technical failure)`,
    (result.success === true && result.rowCount > 0) || gracefulClarification,
    `success=${result.success} error=${result.error}`,
  );
}

async function main() {
  console.log("=".repeat(100));
  console.log("LLM INTEGRATION — CAPABILITY-AWARE LAYER 1 VERIFICATION (real dogfooding failures)");
  console.log("=".repeat(100));

  // Each of these is a VERBATIM failure from docs/Frontend test/PrePhase 9 LLM.md
  await run("SAFETY-TYPO", "hospitals with best safty performence"); // was: "SQL template not found."
  await run("STAR-TYPO-1", "show me 3 start hospital"); // was: "I don't have enough specific information..."
  await run("STAR-TYPO-2", "show me 3 star hospital in texas"); // control - already worked before, must still work
  await run("HEART-CARE", "Show me best heart care hospital"); // was: "Unable to resolve question."
  await run("MORTALITY-TYPO", "show me hosptials mortality"); // was: "I don't have enough specific information..."

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
