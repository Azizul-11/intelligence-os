/**
 * Phase 8.7 - Answerability Classification / Unclassified Failure
 * Closure Verification
 *
 * Phase 8.7's entire approved implementation scope is two generic
 * fallbacks added to `createRuntimeEngine()`
 * (packages/runtime-engine/src/create-runtime-engine.ts): any
 * `success: false` result that would otherwise reach the caller with
 * no `AnswerabilityResult` at all (a raw primary-executor failure, or
 * either of the two Phase 7 secondary-metric bespoke failure returns)
 * now receives `{status: "not_directly_answerable"}` - no reason,
 * since none of the existing six reason values accurately describes a
 * generic executor-level rejection. Every path that already attached a
 * specific answerability (identity-ambiguous, candidate-inconsistent,
 * semantic-incomplete, plan-incomplete, capability-unavailable,
 * data-unavailable) is completely unmodified.
 *
 * Tests 1-7, 10, 11 use the REAL semantic + planner + runtime-engine
 * pipeline against the REAL remote warehouse (SupabaseDatabaseAdapter)
 * - real runtime evidence, not manufactured. Tests 8-9 use a
 * controlled spy executor to deterministically force a primary or
 * secondary execution failure that real data cannot reliably
 * reproduce on demand - clearly labeled controlled failure injection,
 * never presented as production evidence.
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

interface Result {
  id: string;
  description: string;
  pass: boolean;
  detail: string;
}

const results: Result[] = [];

function check(id: string, description: string, pass: boolean, detail: unknown) {
  results.push({ id, description, pass, detail: JSON.stringify(detail) });
}

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
const planner = new QueryPlanner();
const mapper = new ExecutionPlanMapper();

function makeRealEngine() {
  const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  return createRuntimeEngine({
    runtime,
    semantic,
    planner,
    executionPlanMapper: mapper,
    executor: new SqlExecutor(new SupabaseDatabaseAdapter(supabase)),
  });
}

async function run() {
  // 1 - ANSWERABLE
  {
    const engine = makeRealEngine();
    const result = await engine.execute({ question: "best hospitals", parameters: {} });
    const pass = result.success === true && result.answerability?.status === "answerable";
    check("1-ANSWERABLE", '"best hospitals": success=true, answerability.status=answerable', pass, {
      success: result.success,
      answerability: result.answerability,
    });
  }

  // 2 - COMPOUND ANSWERABLE
  {
    const engine = makeRealEngine();
    const result = await engine.execute({
      question: "Which hospitals have the best overall rating and lowest mortality?",
      parameters: {},
    });
    const pass = result.success === true && result.answerability?.status === "answerable";
    check("2-COMPOUND-ANSWERABLE", "multi-metric ranking: success=true, answerability.status=answerable, unchanged", pass, {
      success: result.success,
      answerability: result.answerability,
    });
  }

  // 3 - AMBIGUOUS (Northwest Medical Center)
  {
    const engine = makeRealEngine();
    const result = await engine.execute({ question: "Northwest Medical Center", parameters: {} });
    const pass =
      result.success === false &&
      result.answerability?.status === "ambiguous" &&
      result.answerability?.reason === "identity-ambiguous" &&
      (result.answerability?.candidates?.length ?? 0) === 2;
    check("3-AMBIGUOUS-NORTHWEST", '"Northwest Medical Center": ambiguous/identity-ambiguous, 2 candidates, unchanged', pass, {
      success: result.success,
      answerability: result.answerability,
    });
  }

  // 4 - SAME-NAME AMBIGUITY (Memorial Hospital)
  {
    const engine = makeRealEngine();
    const result = await engine.execute({ question: "Memorial Hospital", parameters: {} });
    const pass =
      result.success === false &&
      result.answerability?.status === "ambiguous" &&
      result.answerability?.reason === "identity-ambiguous" &&
      (result.answerability?.candidates?.length ?? 0) === 12;
    check("4-AMBIGUOUS-MEMORIAL", '"Memorial Hospital": ambiguous/identity-ambiguous, 12 candidates, unchanged', pass, {
      success: result.success,
      answerability: result.answerability,
    });
  }

  // 5 - CAPABILITY UNAVAILABLE
  {
    const engine = makeRealEngine();
    const result = await engine.execute({ question: "emergency department visits by hospital", parameters: {} });
    const pass =
      result.success === false &&
      result.answerability?.status === "not_directly_answerable" &&
      result.answerability?.reason === "capability-unavailable";
    check("5-CAPABILITY-UNAVAILABLE", '"emergency department visits by hospital": not_directly_answerable/capability-unavailable, unchanged', pass, {
      success: result.success,
      answerability: result.answerability,
    });
  }

  // 6 - DATA UNAVAILABLE (8.6B)
  {
    const engine = makeRealEngine();
    const result = await engine.execute({
      question: "mortality rate for Mountain View Hospital in Alabama",
      parameters: {},
    });
    const pass =
      result.success === false &&
      result.answerability?.status === "not_directly_answerable" &&
      result.answerability?.reason === "data-unavailable";
    check("6-DATA-UNAVAILABLE", "Mountain View Hospital + mortality: not_directly_answerable/data-unavailable, unchanged (8.6B untouched)", pass, {
      success: result.success,
      answerability: result.answerability,
    });
  }

  // 7 - MAYO / ROCHESTER SAFETY + PRIMARY FAILURE FALLBACK (real, naturally-occurring)
  //
  // This is the exact real query the Phase 8.7 audit used to discover
  // the gap: the entity resolves to `not_found` (Qualifier Identity
  // Safety's Fix 1 correctly refusing to guess Jacksonville), is
  // dropped, and the plan proceeds without a hospital filter, causing
  // a genuine, naturally-occurring primary-executor failure ("Missing
  // required parameter: hospitalId") - real runtime evidence, not
  // injected.
  {
    const engine = makeRealEngine();
    const result = await engine.execute({
      question: "What is the overall rating of Mayo Clinic in Rochester, Minnesota?",
      parameters: {},
    });
    const rows = result.rows as { facility_id?: string }[];
    const neverJacksonville = !rows.some((row) => row.facility_id === "100151");
    const pass =
      result.success === false &&
      neverJacksonville &&
      result.answerability?.status === "not_directly_answerable" &&
      result.answerability?.reason === undefined;
    check(
      "7-MAYO-ROCHESTER-SAFETY-AND-PRIMARY-FALLBACK",
      '"...Mayo Clinic in Rochester, Minnesota?": never returns Jacksonville (100151), now classified not_directly_answerable with no fabricated reason (real, naturally-occurring primary executor failure)',
      pass,
      { success: result.success, rowCount: result.rowCount, error: result.error, answerability: result.answerability, rows: result.rows },
    );
  }

  // 8 - PRIMARY EXECUTOR FAILURE FALLBACK (controlled failure injection)
  //
  // A spy executor deterministically returns a failed SqlExecutionResult
  // for the primary template, regardless of query - forcing gate 9 in
  // the Section 6 gate list (create-runtime-engine.ts's
  // `if (!primaryResult.success)`) without depending on any specific
  // real query shape. Controlled, not real warehouse evidence.
  {
    const spyExecutor = {
      async execute() {
        return { success: false, rows: [], rowCount: 0, error: "Injected controlled executor failure" };
      },
    };
    const engine = createRuntimeEngine({ runtime, semantic, planner, executionPlanMapper: mapper, executor: spyExecutor as any });
    const result = await engine.execute({ question: "best hospitals", parameters: {} });
    const pass =
      result.success === false &&
      result.answerability?.status === "not_directly_answerable" &&
      result.answerability?.reason === undefined &&
      result.error === "Injected controlled executor failure";
    check(
      "8-PRIMARY-EXECUTOR-FAILURE-FALLBACK",
      "CONTROLLED FAILURE INJECTION (spy executor): primary execution failure now classified not_directly_answerable, no reason",
      pass,
      { success: result.success, error: result.error, answerability: result.answerability },
    );
  }

  // 9 - SECONDARY EXECUTOR FAILURE FALLBACK (controlled failure injection)
  //
  // A spy executor succeeds for the primary ranking template but fails
  // specifically for the secondary metric's `-by-facility-ids`
  // template, exercising Phase 7's secondary-metric mechanism without
  // depending on real data producing a secondary-only failure.
  // Controlled, not real warehouse evidence.
  {
    const spyExecutor = {
      async execute(template: { id: string }) {
        if (template.id === "mortality-rate-by-facility-ids") {
          return { success: false, rows: [], rowCount: 0, error: "Injected controlled secondary executor failure" };
        }
        return {
          success: true,
          rows: [{ facility_id: "100151", state: "FL", hospital_name: "MAYO CLINIC", overall_rating: "5" }],
          rowCount: 1,
        };
      },
    };
    const engine = createRuntimeEngine({ runtime, semantic, planner, executionPlanMapper: mapper, executor: spyExecutor as any });
    const result = await engine.execute({
      question: "Which hospitals have the best overall rating and lowest mortality?",
      parameters: {},
    });
    const pass =
      result.success === false &&
      result.answerability?.status === "not_directly_answerable" &&
      result.answerability?.reason === undefined &&
      /mortality-rate/.test(result.error ?? "");
    check(
      "9-SECONDARY-EXECUTOR-FAILURE-FALLBACK",
      "CONTROLLED FAILURE INJECTION (spy executor, primary succeeds/secondary fails): secondary metric execution failure now classified not_directly_answerable, no reason",
      pass,
      { success: result.success, error: result.error, answerability: result.answerability },
    );
  }

  // 10 - EXISTING REASON PRESERVATION (real, re-checks tests 5 and 6
  // are not somehow overwritten by the new generic fallback logic -
  // both gates return long before reaching either fallback location).
  {
    const engine = makeRealEngine();
    const capabilityResult = await engine.execute({ question: "emergency department visits by hospital", parameters: {} });
    const dataResult = await engine.execute({ question: "mortality rate for Mountain View Hospital in Alabama", parameters: {} });
    const pass =
      capabilityResult.answerability?.reason === "capability-unavailable" &&
      dataResult.answerability?.reason === "data-unavailable";
    check(
      "10-EXISTING-REASON-PRESERVATION",
      "capability-unavailable and data-unavailable reasons are not overwritten by the generic fallback",
      pass,
      { capability: capabilityResult.answerability, data: dataResult.answerability },
    );
  }

  // 11 - COVERAGE NON-BLOCKING
  {
    const engine = makeRealEngine();
    const result = await engine.execute({ question: "best hospitals", parameters: {} });
    const pass =
      result.answerability?.status === "answerable" &&
      Array.isArray(result.coverage) &&
      result.coverage.length > 0;
    check("11-COVERAGE-NON-BLOCKING", '"best hospitals": answerable with coverage present, no downgrade', pass, {
      answerability: result.answerability,
      coverage: result.coverage,
    });
  }

  // 12 - SUCCESS PATH UNCHANGED
  {
    const engine = makeRealEngine();
    const result = await engine.execute({ question: "best hospitals", parameters: {} });
    const pass =
      result.success === true &&
      Array.isArray(result.rows) &&
      result.rows.length === result.rowCount &&
      result.rowCount > 0 &&
      result.error === undefined &&
      result.completeness?.complete === true;
    check("12-SUCCESS-PATH-UNCHANGED", '"best hospitals": rows/rowCount/success/error/completeness shape unchanged', pass, {
      success: result.success,
      rowCount: result.rowCount,
      error: result.error,
      completeness: result.completeness,
    });
  }

  console.log("=".repeat(80));
  console.log("PHASE 8.7 - ANSWERABILITY CLASSIFICATION VERIFICATION");
  console.log("=".repeat(80));

  let allPass = true;
  for (const r of results) {
    const status = r.pass ? "PASS" : "FAIL";
    if (!r.pass) allPass = false;
    console.log(`[${status}] ${r.id} - ${r.description}`);
    console.log(`       ${r.detail}`);
  }

  console.log("=".repeat(80));
  console.log(allPass ? `ALL ${results.length} CHECKS PASSED` : `FAILURES PRESENT (${results.filter((r) => !r.pass).length}/${results.length})`);

  if (!allPass) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
