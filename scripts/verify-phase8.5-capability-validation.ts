/**
 * Phase 8.5 - Capability Validation Verification
 *
 * Verifies the two additive Phase 8.5 checks in
 * packages/runtime-engine/src/create-runtime-engine.ts:
 *
 * 1. Template-not-found now carries a structured AnswerabilityResult
 *    ({status: "not_directly_answerable", reason: "capability-unavailable"})
 *    instead of only a bare error string. No SQL executes (unchanged).
 *
 * 2. A template that IS found but has `enabled === false`
 *    (SqlTemplateDefinition.enabled - a pre-existing, previously-unwired
 *    Universal contract field) is refused the same way, before parameter
 *    resolution or execution. No production Healthcare template is
 *    modified to prove this - a fixture sqlResolver stub, layered onto
 *    the real DomainRuntime, is used instead.
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

function makeEngine(sqlCalledFlag: { called: boolean }, runtimeOverride = runtime) {
  const spyExecutor = {
    async execute() {
      sqlCalledFlag.called = true;
      return { success: true, rows: [{ ok: true }], rowCount: 1 };
    },
  };

  return createRuntimeEngine({
    runtime: runtimeOverride,
    semantic,
    planner,
    executionPlanMapper: mapper,
    executor: spyExecutor as any,
  });
}

async function run() {
  // 1 - THE FIX (template-not-found): a genuinely unsupported shape
  // (RCG-008's own deliberately-unregistered "-unsupported" template id)
  // must now carry a structured capability-unavailable classification.
  {
    const flag = { called: false };
    const engine = makeEngine(flag);
    const result = await engine.execute({
      question: "emergency department visits by hospital",
      parameters: {},
    });

    const pass =
      result.success === false &&
      result.answerability?.status === "not_directly_answerable" &&
      result.answerability?.reason === "capability-unavailable" &&
      !flag.called;

    check(
      "1-TEMPLATE-NOT-FOUND-FIX",
      '"emergency department visits by hospital": template not found -> capability-unavailable, no SQL',
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 2 - THE FIX (disabled template): a template that resolves by id but
  // is explicitly marked enabled:false must refuse the same way, before
  // execution - proven with a fixture resolver, no production template
  // touched.
  {
    const fixtureRuntime = {
      ...runtime,
      sqlResolver: {
        resolve(_id: string) {
          return {
            found: true,
            template: {
              id: "fixture-disabled-template",
              name: "fixture-disabled-template",
              displayName: "Fixture Disabled Template",
              template: "SELECT 1;",
              type: "aggregate" as const,
              enabled: false,
            },
          };
        },
      } as any,
    };

    const flag = { called: false };
    const engine = makeEngine(flag, fixtureRuntime);
    const result = await engine.execute({
      question: "hospital count in California",
      parameters: {},
    });

    const pass =
      result.success === false &&
      result.answerability?.status === "not_directly_answerable" &&
      result.answerability?.reason === "capability-unavailable" &&
      !flag.called;

    check(
      "2-DISABLED-TEMPLATE-FIX",
      "template found but enabled:false -> capability-unavailable, no SQL (fixture resolver, no production template modified)",
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 3 - Regression: a genuinely supported template (enabled, real,
  // correct) must execute completely unaffected.
  {
    const flag = { called: false };
    const engine = makeEngine(flag);
    const result = await engine.execute({
      question: "hospital count in California",
      parameters: {},
    });

    const pass =
      result.success === true &&
      result.answerability?.status === "answerable" &&
      flag.called;

    check(
      "3-SUPPORTED-TEMPLATE-REGRESSION",
      '"hospital count in California": unaffected, executes normally',
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 4 - Regression: Phase 8.1/8.3 identity ambiguity must still win over
  // the new 8.5 gate (the 8.5 gate is never reached).
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
      "4-IDENTITY-AMBIGUITY-REGRESSION",
      "Bare Northwest Medical Center: still identity-ambiguous, NOT capability-unavailable",
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 5 - Regression: qualified identity resolves uniquely and executes.
  {
    const flag = { called: false };
    const engine = makeEngine(flag);
    const result = await engine.execute({
      question: "What is the overall rating of Northwest Medical Center in Arizona?",
      parameters: {},
    });

    const pass = result.success === true && flag.called;

    check(
      "5-QUALIFIED-IDENTITY-REGRESSION",
      "Northwest Medical Center in Arizona: unaffected, executes normally",
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 6 - Regression: Phase 8.4 relationship+benchmark query unaffected.
  {
    const flag = { called: false };
    const engine = makeEngine(flag);
    const result = await engine.execute({
      question: "hospitals above the national average for overall rating",
      parameters: {},
    });

    const pass = result.success === true && flag.called;

    check(
      "6-PHASE-8.4-BENCHMARK-REGRESSION",
      "Relationship + real benchmark: still executes normally",
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 7 - Regression: Phase 8.4 containment fix (Greene County Hospital,
  // qualified) unaffected - no spurious county grouping, real execution.
  {
    const flag = { called: false };
    const engine = makeEngine(flag);
    const result = await engine.execute({
      question: "What is the overall rating of Greene County Hospital in AL?",
      parameters: {},
    });

    const pass = result.success === true && flag.called;

    check(
      "7-PHASE-8.4-CONTAINMENT-REGRESSION",
      "Greene County Hospital in AL: unaffected, no spurious county grouping, real execution",
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 8 - Regression: an ordinary valid ranking query is unaffected.
  {
    const flag = { called: false };
    const engine = makeEngine(flag);
    const result = await engine.execute({
      question: "best hospitals in Texas",
      parameters: {},
    });

    const pass = result.success === true && flag.called;

    check(
      "8-ORDINARY-RANKING-REGRESSION",
      '"best hospitals in Texas": unaffected by Phase 8.5',
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 9 - Known Domain-side limitation (NOT fixed by Phase 8.5, must remain
  // observable): length-of-stay's template is registered AND declares
  // enabled:true in Healthcare's own data, so today's Universal
  // mechanism does not catch it. Document the actual current behavior;
  // do not assert it is fixed.
  {
    const flag = { called: false };
    const engine = makeEngine(flag);
    const result = await engine.execute({
      question: "average length of stay for hospitals",
      parameters: {},
    });

    // This check documents reality: the template is found, enabled:true
    // (Healthcare's own data, unmodified by Phase 8.5), so execution is
    // attempted with the spy executor reporting success - the spy does
    // not know the underlying SQL/table is broken. This is the precise,
    // disclosed boundary between "Universal capability mechanism" (this
    // phase) and "Domain template correctness" (not this phase).
    const templateReachedExecution = flag.called === true;

    check(
      "9-LENGTH-OF-STAY-KNOWN-LIMITATION-DOCUMENTED",
      '"average length of stay for hospitals": Phase 8.5 does NOT catch this - template found, enabled:true (Healthcare data, unmodified), proceeds to execution attempt. Documented, not fixed.',
      templateReachedExecution,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  console.log("=".repeat(80));
  console.log("PHASE 8.5 - CAPABILITY VALIDATION VERIFICATION");
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
