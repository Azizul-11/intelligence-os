/**
 * Tier1 Task 6 Fix Verification: Dynamic Contextual Follow-Up
 * Suggestions & Graceful Guidance Engine.
 *
 * Live, in-process, against the remote Supabase warehouse (same harness
 * as every prior Tier1 verification script).
 * Run: npx tsx scripts/verify-tier1-t6-suggestions-fix.ts
 *
 * Two mandatory invariants from the master prompt, both checked here:
 *  1. Every-Turn Invariant - `suggestions` is defined with 2-3 items on
 *     EVERY query (success, clarification, guidance, and true dead-end).
 *  2. 100% Executable Guarantee - every suggested string, re-executed
 *     independently through the same engine, returns success && rowCount > 0.
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
const engine = createRuntimeEngine({ runtime, semantic, planner, executionPlanMapper: mapper, executor });

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
  // Tier1 Task 6: suggestions are opt-in per request (see
  // RuntimeRequest.includeSuggestions) - this script's own top-level
  // calls are exactly the kind of real, fresh top-level question the
  // production orchestrator opts in for; the round-trip re-execution in
  // verifyAllExecutable() below deliberately omits it, matching
  // create-runtime-engine.ts's own recursion-terminating dry-run calls.
  const result = await engine.execute({ question, includeSuggestions: true });
  console.log(
    `    "${question}" -> success=${result.success} rowCount=${result.rowCount} answerability=${JSON.stringify(result.answerability)} suggestions=${JSON.stringify(result.suggestions)}`,
  );
  return result;
}

/**
 * The 100% Executable Guarantee - re-runs every suggested string
 * INDEPENDENTLY (a fresh top-level engine.execute(), exactly what
 * clicking the chip in QueryConsole.tsx does) and requires success with
 * at least one row. This double-checks create-runtime-engine.ts's own
 * production dry-run (which already gates what ever reaches
 * `suggestions` in the first place) against a second, independent
 * execution - proving the guarantee live, not just by code inspection.
 */
async function verifyAllExecutable(id: string, suggestions: string[] | undefined) {
  if (!suggestions) {
    return;
  }
  for (let i = 0; i < suggestions.length; i++) {
    const suggestion = suggestions[i]!;
    const trial = await engine.execute({ question: suggestion });
    check(
      `${id}-EXEC-${i + 1}`,
      `suggestion "${suggestion}" executes successfully with rows`,
      trial.success === true && trial.rowCount > 0,
      `success=${trial.success} rowCount=${trial.rowCount} error=${trial.error}`,
    );
  }
}

async function main() {
  console.log("=".repeat(100));
  console.log("TIER1 TASK 6 SUGGESTIONS FIX VERIFICATION");
  console.log("=".repeat(100));

  console.log("\n--- Group A: success path - suggestions present, contextual, all executable ---");
  {
    const result = await run("Tell me about Mayo Clinic");
    check("A1", "single-hospital: suggestions present, 2-3 items", result.success === true && Array.isArray(result.suggestions) && result.suggestions.length >= 2 && result.suggestions.length <= 3, JSON.stringify(result.suggestions));
    await verifyAllExecutable("A1", result.suggestions);
  }
  {
    const result = await run("Best hospitals in Texas");
    check("A2", "single-state: suggestions present, 2-3 items", result.success === true && Array.isArray(result.suggestions) && result.suggestions.length >= 2 && result.suggestions.length <= 3, JSON.stringify(result.suggestions));
    await verifyAllExecutable("A2", result.suggestions);
  }
  {
    const result = await run("Best hospitals in Texas and California");
    check("A3", "multi-state: suggestions present, 2-3 items", result.success === true && Array.isArray(result.suggestions) && result.suggestions.length >= 2 && result.suggestions.length <= 3, JSON.stringify(result.suggestions));
    await verifyAllExecutable("A3", result.suggestions);
  }
  {
    const result = await run("Show me non-profit hospitals with best AMI mortality");
    check("A4", "condition-specific: suggestions present, 2-3 items", result.success === true && Array.isArray(result.suggestions) && result.suggestions.length >= 2 && result.suggestions.length <= 3, JSON.stringify(result.suggestions));
    await verifyAllExecutable("A4", result.suggestions);
  }

  console.log("\n--- Group B: capability-unavailable WITH alternatives - suggestions derived from real alternatives, all executable ---");
  {
    const result = await run("Top non-profit hospitals in Texas and California");
    check("B1", "capability-unavailable: suggestions present, 2-3 items", result.success === false && Array.isArray(result.suggestions) && result.suggestions.length >= 2 && result.suggestions.length <= 3, JSON.stringify(result.suggestions));
    await verifyAllExecutable("B1", result.suggestions);
  }

  console.log("\n--- Group C: true dead end (zero semantic candidates) - the worse gap this task closes - suggestions still present ---");
  {
    const result = await run("Show me hospitals with best ratings");
    check("C1", "bare 'ratings': no longer a silent dead end - suggestions present, 2-3 items", Array.isArray(result.suggestions) && result.suggestions.length >= 2 && result.suggestions.length <= 3, JSON.stringify(result.suggestions));
    await verifyAllExecutable("C1", result.suggestions);
  }
  {
    const result = await run("What is the weather like today?");
    check("C2", "off-topic question: suggestions present, 2-3 items", Array.isArray(result.suggestions) && result.suggestions.length >= 2 && result.suggestions.length <= 3, JSON.stringify(result.suggestions));
    await verifyAllExecutable("C2", result.suggestions);
  }

  console.log("\n--- Group D: identity-ambiguous - suggestions derived from real candidates[], resolve the clarification turn ---");
  {
    const result = await run("Tell me everything about Memorial Hospital");
    check("D1", "identity-ambiguous: suggestions present, 2-3 items", result.success === false && Array.isArray(result.suggestions) && result.suggestions.length >= 2 && result.suggestions.length <= 3, JSON.stringify(result.suggestions));
    // Tier1 T6 regression fix (bug 1, found by live frontend dogfooding
    // after this script was first written): an identity-ambiguous
    // suggestion is a CONTINUATION TOKEN (e.g. a bare city name), not a
    // standalone question - re-executing it as a fresh top-level
    // question (verifyAllExecutable's own full round-trip) was always
    // going to fail, since e.g. "BELLEVILLE" alone is itself ambiguous
    // across multiple states nationwide. The real, correct proof is that
    // it uniquely matches one of THIS response's own offered
    // clarification options via the same matchClarificationResponse()
    // continuation.ts itself uses - see
    // verify-tier1-t6-suggestions-fix-3bugs.ts for the authoritative,
    // dedicated verification of this and the other 2 regression fixes.
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
      check(`D1-MATCH-${suggestion}`, `chip "${suggestion}" uniquely matches an offered clarification option`, matched !== null, JSON.stringify(matched));
    }
  }

  console.log("\n--- Group E: different questions get different suggestions (not the same static 3 every time) ---");
  {
    const r1 = await run("Best hospitals in Texas");
    const r2 = await run("Tell me about Mayo Clinic");
    const same = JSON.stringify(r1.suggestions) === JSON.stringify(r2.suggestions);
    check("E1", "two unrelated queries produce different suggestion sets", !same, `r1=${JSON.stringify(r1.suggestions)} r2=${JSON.stringify(r2.suggestions)}`);
  }

  console.log("\n--- Group F: opt-in default - a request that doesn't ask for suggestions gets none (zero behavior change for every pre-existing caller) ---");
  {
    const trial = await engine.execute({ question: "Tell me about Mayo Clinic" });
    check("F1", "no includeSuggestions -> no suggestions field, unchanged pre-Tier1-T6 behavior", trial.suggestions === undefined, JSON.stringify(trial.suggestions));
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
