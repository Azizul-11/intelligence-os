/**
 * Phase 8.4 - Candidate Consistency Verification
 *
 * Verifies the two additive Phase 8.4 mechanisms:
 *
 * 1. Containment suppression (packages/semantic/src/pipeline/semantic-pipeline.ts):
 *    a non-entity candidate (e.g. dimension) whose span is fully
 *    contained within a successfully-resolved entity candidate's span
 *    (e.g. "county" inside "Greene County Hospital") no longer survives
 *    as a spurious independent signal, and no longer contaminates the
 *    ExecutionPlan with an unrequested grouping.
 *
 * 2. Relationship-without-benchmark detection
 *    (packages/query-planner/src/candidate-consistency.ts,
 *    wired into packages/runtime-engine/src/create-runtime-engine.ts):
 *    a "relationship" candidate (above/below) with no "benchmark"
 *    candidate to compare against now refuses honestly instead of
 *    silently executing as an ordinary, unfiltered query.
 *
 * Uses the real semantic + planner + runtime-engine pipeline throughout,
 * with a spy SqlExecutor to prove SQL is called (or not) for each case -
 * no SQL execution against a real database.
 */

import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";

interface Result {
  id: string;
  description: string;
  pass: boolean;
  detail: string;
}

const results: Result[] = [];

function check(id: string, description: string, pass: boolean, detail: string) {
  results.push({ id, description, pass, detail });
}

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
const planner = new QueryPlanner();
const mapper = new ExecutionPlanMapper();

function makeEngine(sqlCalledFlag: { called: boolean }) {
  const spyExecutor = {
    async execute() {
      sqlCalledFlag.called = true;
      return { success: true, rows: [{ ok: true }], rowCount: 1 };
    },
  };

  return createRuntimeEngine({
    runtime,
    semantic,
    planner,
    executionPlanMapper: mapper,
    executor: spyExecutor as any,
  });
}

async function run() {
  // 1 - THE FIX (containment): Greene County Hospital qualified query
  // must now reach real execution, with no spurious county grouping.
  {
    const semanticResult = semantic.resolve("What is the overall rating of Greene County Hospital in AL?");
    const planResult = planner.createPlan(semanticResult, runtime.domain.metrics);
    const executionPlan = planResult.plan ? mapper.map(planResult.plan) : null;

    const flag = { called: false };
    const engine = makeEngine(flag);
    const result = await engine.execute({
      question: "What is the overall rating of Greene County Hospital in AL?",
      parameters: {},
    });

    const pass =
      executionPlan !== null &&
      executionPlan.grouping === undefined &&
      executionPlan.filters.some((f) => f.field === "hospital" && f.value === "010051") &&
      result.success === true &&
      flag.called;

    check(
      "1-GREENE-CONTAINMENT-FIX",
      "Greene County Hospital in AL: no spurious county grouping, real execution reached",
      pass,
      JSON.stringify({ executionPlan, result, sqlCalled: flag.called }),
    );
  }

  // 2 - Regression: Northwest Medical Center in Arizona still resolves
  // uniquely and executes (containment fix must not affect entities).
  {
    const flag = { called: false };
    const engine = makeEngine(flag);
    const result = await engine.execute({
      question: "What is the overall rating of Northwest Medical Center in Arizona?",
      parameters: {},
    });

    const pass = result.success === true && flag.called;

    check(
      "2-NORTHWEST-REGRESSION",
      "Northwest Medical Center in Arizona: unaffected, still executes",
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 3 - Regression: bare Greene County Hospital remains ambiguous (Phase
  // 8.1 identity-ambiguity untouched by the containment fix).
  {
    const flag = { called: false };
    const engine = makeEngine(flag);
    const result = await engine.execute({
      question: "Greene County Hospital overall rating",
      parameters: {},
    });

    const pass =
      result.success === false &&
      result.answerability?.status === "ambiguous" &&
      result.answerability?.reason === "identity-ambiguous" &&
      typeof result.error === "string" &&
      result.error.includes("EUTAW, AL") &&
      result.error.includes("LEAKESVILLE, MS") &&
      !flag.called;

    check(
      "3-GREENE-BARE-AMBIGUITY-REGRESSION",
      "Bare Greene County Hospital: still correctly ambiguous, no SQL",
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 4 - Regression: bare Northwest Medical Center remains ambiguous.
  {
    const flag = { called: false };
    const engine = makeEngine(flag);
    const result = await engine.execute({
      question: "Northwest Medical Center overall rating",
      parameters: {},
    });

    const pass =
      result.success === false &&
      result.answerability?.status === "ambiguous" &&
      result.answerability?.reason === "identity-ambiguous" &&
      !flag.called;

    check(
      "4-NORTHWEST-BARE-AMBIGUITY-REGRESSION",
      "Bare Northwest Medical Center: still correctly ambiguous, no SQL",
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 5 - THE FIX (relationship-without-benchmark): must refuse, not
  // silently execute an unfiltered query.
  {
    const flag = { called: false };
    const engine = makeEngine(flag);
    const result = await engine.execute({
      question: "hospitals with mortality rates above 5 percent",
      parameters: {},
    });

    const pass =
      result.success === false &&
      result.answerability?.status === "ambiguous" &&
      result.answerability?.reason === "candidate-inconsistent" &&
      !flag.called;

    check(
      "5-RELATIONSHIP-WITHOUT-BENCHMARK-FIX",
      '"hospitals with mortality rates above 5 percent" no longer silently executes; refuses honestly, no SQL',
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 6 - Regression: relationship + benchmark both present must still
  // build a real benchmark and execute normally (RCG-009).
  {
    const flag = { called: false };
    const engine = makeEngine(flag);
    const result = await engine.execute({
      question: "hospitals above the national average for overall rating",
      parameters: {},
    });

    const pass = result.success === true && flag.called;

    check(
      "6-RCG-009-BENCHMARK-REGRESSION",
      "Relationship + real benchmark: still executes normally (unaffected by the new check)",
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 7 - Regression: an ordinary valid query with no relationship at all
  // must be completely unaffected.
  {
    const flag = { called: false };
    const engine = makeEngine(flag);
    const result = await engine.execute({
      question: "best hospitals in Texas",
      parameters: {},
    });

    const pass = result.success === true && flag.called;

    check(
      "7-ORDINARY-QUERY-REGRESSION",
      '"best hospitals in Texas": unaffected by either Phase 8.4 mechanism',
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  console.log("=".repeat(80));
  console.log("PHASE 8.4 - CANDIDATE CONSISTENCY VERIFICATION");
  console.log("=".repeat(80));

  let allPass = true;

  for (const r of results) {
    const status = r.pass ? "PASS" : "FAIL";
    if (!r.pass) allPass = false;
    console.log(`[${status}] ${r.id} - ${r.description}`);
    console.log(`       ${r.detail}`);
  }

  console.log("=".repeat(80));
  console.log(
    allPass
      ? `ALL ${results.length} CHECKS PASSED`
      : `FAILURES PRESENT (${results.filter((r) => !r.pass).length}/${results.length})`,
  );

  if (!allPass) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
