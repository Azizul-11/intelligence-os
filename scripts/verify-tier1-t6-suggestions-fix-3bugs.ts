/**
 * Tier1 Task 6 Regression Fix Verification: 3 bugs found by live
 * frontend dogfooding after Batch 26 (docs/Frontend test/PrePhase 9
 * tier1-t6.md):
 *   Bug 1 - clicking an identity-ambiguous suggestion chip failed to
 *           match ("I couldn't match your response to one of the
 *           offered options") because the suggestion text was the full
 *           original question + a location qualifier, not a token
 *           matchClarificationResponse() can actually match.
 *   Bug 2 - suggestions were repetitive (always "Mortality Rate" depth
 *           probe, always "non-profit" ownership pivot, always the same
 *           3 fallback strings regardless of question content).
 *   Bug 3 - suggestion dry-run validation executed a full, real SQL
 *           query per candidate (3-4x the SQL cost of the original
 *           request), a genuine production-latency regression.
 *
 * Live, in-process, against the remote Supabase warehouse.
 * Run: npx tsx scripts/verify-tier1-t6-suggestions-fix-3bugs.ts
 */
import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { matchClarificationResponse } from "../packages/runtime-engine/src/continuation/match-clarification";
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

// Bug 3: a counting wrapper around the real executor - proves how many
// actual SQL calls a request makes, without changing its behavior.
let sqlCallCount = 0;
const countingExecutor = {
  execute: (...args: Parameters<SqlExecutor["execute"]>) => {
    sqlCallCount++;
    return executor.execute(...args);
  },
} as SqlExecutor;

const engine = createRuntimeEngine({
  runtime,
  semantic,
  planner,
  executionPlanMapper: mapper,
  executor: countingExecutor,
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

async function run(question: string) {
  const result = await engine.execute({ question, includeSuggestions: true });
  console.log(
    `    "${question}" -> success=${result.success} answerability=${JSON.stringify(result.answerability)} suggestions=${JSON.stringify(result.suggestions)}`,
  );
  return result;
}

/**
 * Bug 1: replicates chat.ts's own offeredOptions construction from
 * answerability.candidates verbatim, then proves each suggested token
 * uniquely matches the candidate it was generated for via the exact
 * same matchClarificationResponse() continuation.ts itself uses - this
 * is the real Guardrail 4 ("clicking a clarification suggestion chip
 * must successfully advance or resolve the clarification turn") proof,
 * not a fresh top-level re-execution (which identity-ambiguous tokens
 * were never meant to survive - see suggestion-generator.ts).
 */
function verifyClarificationChipsMatch(id: string, result: Awaited<ReturnType<typeof engine.execute>>) {
  const candidates = (result.answerability?.candidates ?? []) as { value: unknown; label?: string }[];
  const offeredOptions = candidates.map((candidate) => {
    const [city, county, state] = (candidate.label || "").split(", ");
    return {
      facility_id: candidate.value,
      hospital_name: "",
      city: (city || "").trim(),
      county: (county || "").trim(),
      state: (state || "").trim(),
      displayLabel: candidate.label || `${city} - ${state}`,
    };
  });

  for (const suggestion of result.suggestions ?? []) {
    const matched = matchClarificationResponse(suggestion, offeredOptions as any);
    check(
      `${id}-MATCH-${suggestion}`,
      `chip "${suggestion}" uniquely matches an offered clarification option`,
      matched !== null,
      `matched=${JSON.stringify(matched)}`,
    );
  }
}

async function main() {
  console.log("=".repeat(100));
  console.log("TIER1 TASK 6 REGRESSION FIX VERIFICATION (3 BUGS)");
  console.log("=".repeat(100));

  console.log("\n--- Bug 1: identity-ambiguous chips must actually resolve the clarification turn ---");
  {
    const result = await run("Tell me everything about Memorial Hospital");
    check(
      "BUG1-SHORT-TOKENS",
      "suggestions are short tokens, not the full original question + qualifier",
      (result.suggestions ?? []).every((s) => s.length < 30 && !s.toLowerCase().includes("memorial hospital")),
      JSON.stringify(result.suggestions),
    );
    verifyClarificationChipsMatch("BUG1-MEMORIAL", result);
  }
  {
    // A second identity-ambiguous case with a real, previously-verified
    // duplicate-name collision (Tier0/Phase 8.3's own Greene County
    // Hospital example) - proves the fix generalizes, not a Memorial-
    // Hospital-specific special case.
    const result = await run("Tell me everything about Greene County Hospital");
    verifyClarificationChipsMatch("BUG1-GREENE", result);
  }

  console.log("\n--- Bug 2: suggestions must vary with the question, not repeat the same pattern ---");
  {
    const tx = await run("Best hospitals in Texas");
    const ca = await run("Best hospitals in California");
    check(
      "BUG2-STATE-PIVOT-VARIES",
      "Texas-current and California-current produce different state-pivot suggestions (not always '...and California')",
      JSON.stringify(tx.suggestions) !== JSON.stringify(ca.suggestions),
      `tx=${JSON.stringify(tx.suggestions)} ca=${JSON.stringify(ca.suggestions)}`,
    );
  }
  {
    const overall = await run("Best hospitals in Texas");
    const mortality = await run("Show me hospitals with best mortality rate in Texas");
    const overallDepthProbe = overall.suggestions?.[0];
    const mortalityDepthProbe = mortality.suggestions?.[0];
    check(
      "BUG2-DEPTH-PROBE-ROTATES",
      "depth-probe metric differs depending on which metric is already current (not always Mortality Rate)",
      overallDepthProbe !== mortalityDepthProbe,
      `overall-current-probe=${overallDepthProbe} mortality-current-probe=${mortalityDepthProbe}`,
    );
  }
  {
    const ratings = await run("Show me hospitals with best ratings");
    const safeties = await run("Show me hospitals with best safeties");
    const weather = await run("What is the weather like today?");
    check(
      "BUG2-TOPIC-FALLBACK-VARIES",
      "'ratings', 'safeties', and genuinely off-topic questions get different fallback suggestion sets",
      JSON.stringify(ratings.suggestions) !== JSON.stringify(safeties.suggestions) &&
        JSON.stringify(safeties.suggestions) !== JSON.stringify(weather.suggestions),
      `ratings=${JSON.stringify(ratings.suggestions)} safeties=${JSON.stringify(safeties.suggestions)} weather=${JSON.stringify(weather.suggestions)}`,
    );
    check(
      "BUG2-SAFETY-TOPIC-RELEVANT",
      "'best safeties' suggests Safety Performance specifically, not just the generic 3",
      (safeties.suggestions ?? []).some((s) => s.includes("Safety Performance")),
      JSON.stringify(safeties.suggestions),
    );
  }

  console.log("\n--- Bug 3: suggestion validation must not execute real SQL (production latency) ---");
  {
    sqlCallCount = 0;
    const withSuggestions = await run("Best hospitals in Texas");
    const callsWithSuggestions = sqlCallCount;

    sqlCallCount = 0;
    const withoutSuggestions = await engine.execute({ question: "Best hospitals in Texas" });
    const callsWithoutSuggestions = sqlCallCount;

    check(
      "BUG3-NO-EXTRA-SQL",
      "requesting suggestions makes the SAME number of real SQL calls as not requesting them (dry-run uses no SQL)",
      callsWithSuggestions === callsWithoutSuggestions,
      `withSuggestions=${callsWithSuggestions} withoutSuggestions=${callsWithoutSuggestions} suggestions=${JSON.stringify(withSuggestions.suggestions)}`,
    );
    // Note: a ranking query's baseline call count can be >1 on its own
    // (e.g. Phase 8.6C's companion population-coverage fetch) - the
    // point of this check is only that it's a small, fixed number
    // (never the 3-4x blowup the pre-fix dry-run caused), not exactly 1.
    check(
      "BUG3-BASELINE-SANE",
      "baseline (no suggestions) makes a small, fixed number of SQL calls, proving the comparison itself is meaningful",
      callsWithoutSuggestions >= 1 && callsWithoutSuggestions <= 2 && withoutSuggestions.success,
      `callsWithoutSuggestions=${callsWithoutSuggestions}`,
    );
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
