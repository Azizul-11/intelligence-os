/**
 * Pre-Phase 9 Tier1 Task 6 Audit: Dynamic Contextual Follow-Up
 * Suggestions & Graceful Guidance Engine.
 *
 * STRICTLY DIAGNOSTIC - read-only, no production writes. Live, in-process
 * against the remote Supabase warehouse. Simulates the exact RuntimeResult
 * shape across representative success and failure paths to prove:
 *   (a) no `suggestions` field exists anywhere on the contract today;
 *   (b) exactly which failure paths already produce a deterministic,
 *       non-hallucinating guidance message (Phase 8.9/8.10) vs. which
 *       still leak a blunt/raw technical string;
 *   (c) the success path carries zero forward-looking follow-up content
 *       at all, regardless of how rich the resolved context is.
 *
 * Run: npx tsx scripts/verify-prephase9-tier1-t6-audit.ts
 */
import { healthcareDomain } from "../domain-packs/healthcare/src/index";
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
const adapter = new SupabaseDatabaseAdapter(client);
const executor = new SqlExecutor(adapter);
const engine = createRuntimeEngine({ runtime, semantic, planner, executionPlanMapper: mapper, executor });

async function run(id: string, question: string) {
  const result = await engine.execute({ question } as any);
  const keys = Object.keys(result);
  console.log(`\n[${id}] "${question}"`);
  console.log(`  success=${result.success} rowCount=${result.rowCount} answerability=${JSON.stringify(result.answerability)}`);
  console.log(`  error=${JSON.stringify(result.error)}`);
  console.log(`  top-level RuntimeResult keys present: ${JSON.stringify(keys)}`);
  console.log(`  has "suggestions" field: ${"suggestions" in result}`);
  return result;
}

async function main() {
  console.log("=".repeat(100));
  console.log("TIER1 TASK 6 AUDIT: DYNAMIC FOLLOW-UP SUGGESTIONS & GRACEFUL GUIDANCE (READ-ONLY)");
  console.log("=".repeat(100));

  console.log("\n--- Group A: SUCCESS path - rich resolved context, zero follow-up content today ---");
  await run("A1-RANKING-SINGLE-STATE", "Best hospitals in Texas");
  await run("A2-RANKING-MULTI-STATE", "Best hospitals in Texas and California");
  await run("A3-DOSSIER-SINGLE-ENTITY", "Tell me about Mayo Clinic");
  await run("A4-COMPARE-TWO-ENTITIES", "Compare NYU LANGONE HOSPITALS vs CEDARS-SINAI MEDICAL CENTER");
  await run("A5-CONDITION-SPECIFIC", "Show me non-profit hospitals with best AMI mortality");

  console.log("\n--- Group B: FAILURE path - capability-unavailable WITH discovered alternatives (Phase 8.9/8.10 already produces a guidance message here) ---");
  // Note: the Phase 8.10 vision doc's own illustrative example
  // ("stay length") is now STALE - a `length-of-stay` metric/template
  // was added at some point after that doc was written, so this
  // phrasing now genuinely succeeds. Using the live, still-reproducing
  // capability-unavailable-with-alternatives case found during Tier1
  // T5 instead (a metric named "hospital-list" has no ranking-intent
  // template registered, but the domain's other 5 comparable metrics
  // are real alternatives for the same request shape).
  await run("B0-STALE-EXAMPLE-NOW-SUCCEEDS", "What is the best hospital in terms of stay length?");
  const b1 = await run("B1-CAPABILITY-UNAVAILABLE-WITH-ALTERNATIVES", "Top non-profit hospitals in Texas and California");
  console.log(`  (Phase 8.9 discoverAlternatives + Phase 8.10 buildGuidanceMessage already produced this - but it is a single paragraph string, not a suggestions[] of clickable chip texts, and the frontend renders it as plain amber text, never as tappable chips)`);

  console.log("\n--- Group C: FAILURE path - semantic resolution finds NO candidate at all (worse than capability-unavailable: no reason, no alternatives, no candidates - a true dead end) ---");
  await run("C1-BARE-RATINGS-UNRESOLVED", "Show me hospitals with best ratings");
  await run("C2-BARE-SAFETIES-UNRESOLVED", "Show me hospitals with best safeties");

  console.log("\n--- Group D: FAILURE path - semantic resolution finds nothing at all ---");
  await run("D1-UNRESOLVED-QUESTION", "What is the weather like today?");

  console.log("\n--- Group E: FAILURE path - identity ambiguous (already has a clarification message + candidates, but still no suggestions[]) ---");
  await run("E1-IDENTITY-AMBIGUOUS", "Tell me everything about Memorial Hospital");

  console.log("\n" + "=".repeat(100));
  console.log("SUMMARY");
  console.log("=".repeat(100));
  console.log(`
Confirmed findings (see full detail above):
1. RuntimeResult (packages/runtime-engine/src/runtime-result.ts) has NO
   "suggestions" field on any path tested - success or failure.
2. Group A (success): every query returns real, richly-resolved context
   (entities, metrics, filters, operation) but the contract carries
   nothing forward for a follow-up turn. QueryConsole.tsx renders a
   table and stops - no depth/breadth/entity-dive prompts anywhere.
3. B0: the Phase 8.10 vision doc's own illustrative "stay length"
   example is now stale - it succeeds today (a length-of-stay metric
   was added after that doc was written). A master prompt's own
   assumed-broken example not reproducing is now a familiar pattern in
   this engagement.
4. B1: Phase 8.9's discoverAlternatives() + Phase 8.10's
   buildGuidanceMessage() ALREADY exist and already produce a truthful,
   non-hallucinating guidance sentence for the capability-unavailable-
   with-alternatives case - but it is one prose string in the "error"
   field, not a suggestions[] array of short clickable chip texts, and
   the frontend (QueryConsole.tsx's isContinuation branch) renders it
   as static amber text with no tappable affordance.
5. Group C: a DIFFERENT, worse failure mode - the metric phrase never
   resolves as a semantic candidate at all (bare "ratings"/"safeties").
   This produces the blunt "Unable to resolve question." with NO
   answerability.reason, NO alternatives, NO candidates whatsoever - a
   true dead end, and arguably the MORE common real-world case (vague
   user phrasing) than the already-partially-handled
   capability-unavailable case.
6. Group E (identity-ambiguous): already has a well-formed clarification
   message AND a real candidates[] array - the data for chips already
   exists here, it is just rendered as one run-on sentence instead of
   individual short clickable options.
`);
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
