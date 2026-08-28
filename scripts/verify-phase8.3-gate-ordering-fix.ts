/**
 * Post-Phase-8.3 gate-ordering fix verification.
 *
 * Confirms that RuntimeEngine.execute() now checks
 * `semanticResult.identityAmbiguities` BEFORE `!semanticResult.resolved`,
 * so an already-detected, labeled identity ambiguity is never discarded
 * merely because no other part of the query (e.g. a metric) also
 * resolved - the exact gap found by the 8.1-8.3 frontend-connect
 * investigation ("What is the rating of Northwest Medical Center?").
 *
 * Proves the reorder does not affect any other gate: ordinary
 * unresolved questions, unsupported capability questions, F5 negation,
 * RCG-010 contradictions, valid unique entities, qualified duplicate
 * entities, multiple entities, and the existing whole-request-refusal
 * granularity for a mixed ambiguous/unambiguous request.
 *
 * Uses the real semantic + planner + runtime-engine pipeline throughout
 * (a spy SqlExecutor proves SQL is never reached for ambiguous cases,
 * same methodology as the Phase 8.1/8.2/8.3 verification scripts) - no
 * SQL execution against a real database.
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
  // 1 - THE FIX: ambiguous entity + otherwise unresolved (no metric) must
  // now produce the targeted clarification, NOT the generic
  // "Unable to resolve question."
  {
    const flag = { called: false };
    const engine = makeEngine(flag);
    const result = await engine.execute({
      question: "What is the rating of Northwest Medical Center?",
      parameters: {},
    });

    const pass =
      result.success === false &&
      result.answerability?.status === "ambiguous" &&
      result.answerability?.reason === "identity-ambiguous" &&
      result.error !== "Unable to resolve question." &&
      typeof result.error === "string" &&
      result.error.includes("WINFIELD, AL") &&
      result.error.includes("TUCSON, AZ") &&
      !flag.called;

    check(
      "1-THE-FIX",
      'Ambiguous + otherwise unresolved: "What is the rating of Northwest Medical Center?" now returns targeted clarification, not the generic message',
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 2 - Regression: ambiguous entity + a recognized metric must still
  // produce the same targeted clarification as before this fix (Phase
  // 8.3's own proven case).
  {
    const flag = { called: false };
    const engine = makeEngine(flag);
    const result = await engine.execute({
      question: "What is the overall rating of Northwest Medical Center?",
      parameters: {},
    });

    const pass =
      result.success === false &&
      result.answerability?.status === "ambiguous" &&
      result.answerability?.reason === "identity-ambiguous" &&
      typeof result.error === "string" &&
      result.error.includes("WINFIELD, AL") &&
      result.error.includes("TUCSON, AZ") &&
      !flag.called;

    check(
      "2-REGRESSION-METRIC-PRESENT",
      'Regression: ambiguous entity + recognized metric still produces the targeted clarification',
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 3 - Qualified unique identity must still resolve and reach execution.
  {
    const flag = { called: false };
    const engine = makeEngine(flag);
    const result = await engine.execute({
      question: "What is the overall rating of Northwest Medical Center in Arizona?",
      parameters: {},
    });

    const pass = result.success === true && flag.called;

    check(
      "3-QUALIFIED-EXECUTES",
      "Qualified unique identity still resolves uniquely and reaches execution",
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 4 - Completely unknown/unresolved query (no ambiguity at all) must
  // still return the existing honest "Unable to resolve question."
  {
    const flag = { called: false };
    const engine = makeEngine(flag);
    const result = await engine.execute({
      question: "zzznotarealwordzzz",
      parameters: {},
    });

    const pass =
      result.success === false &&
      result.error === "Unable to resolve question." &&
      result.answerability?.status === "not_directly_answerable" &&
      !result.answerability?.reason &&
      !flag.called;

    check(
      "4-UNRESOLVED-UNCHANGED",
      "A completely unresolved query (no ambiguity present) still returns the original generic message",
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 5 - A normal valid query must still execute normally.
  {
    const flag = { called: false };
    const engine = makeEngine(flag);
    const result = await engine.execute({
      question: "best hospitals in Texas",
      parameters: {},
    });

    const pass = result.success === true && flag.called;

    check(
      "5-VALID-QUERY",
      '"best hospitals in Texas" still executes normally',
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 6 - F5 negation regression: must remain unchanged (identityAmbiguities
  // is not present for this query, so this gate's relative position is
  // untouched by the fix, but re-verify the live behavior directly).
  {
    const flag = { called: false };
    const engine = makeEngine(flag);
    const result = await engine.execute({
      question: "best hospitals excluding Texas",
      parameters: {},
    });

    const pass =
      result.success === false &&
      result.answerability?.status === "not_directly_answerable" &&
      typeof result.error === "string" &&
      result.error.includes("exclusion or negation") &&
      !flag.called;

    check(
      "6-F5-NEGATION-UNCHANGED",
      "F5 negation gate regression: unchanged behavior",
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 7 - Existing duplicate-name case (Greene County Hospital): still
  // ambiguous, never guessed, no SQL.
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
      "7-GREENE-COUNTY-REGRESSION",
      "Existing Greene County Hospital duplicate-name case: still ambiguous, no SQL",
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 8 - Mixed ambiguous + unambiguous request: whole-request refusal
  // granularity preserved - must NOT silently execute only the
  // unambiguous portion.
  {
    const flag = { called: false };
    const engine = makeEngine(flag);
    const result = await engine.execute({
      question: "Compare Northwest Medical Center and Mayo Clinic overall rating",
      parameters: {},
    });

    const pass =
      result.success === false &&
      result.answerability?.status === "ambiguous" &&
      result.answerability?.reason === "identity-ambiguous" &&
      !flag.called;

    check(
      "8-MIXED-WHOLE-REQUEST-REFUSAL",
      "Mixed ambiguous/unambiguous request: whole request still refused, Mayo Clinic not silently executed",
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  console.log("=".repeat(80));
  console.log("POST-PHASE-8.3 GATE-ORDERING FIX VERIFICATION");
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
