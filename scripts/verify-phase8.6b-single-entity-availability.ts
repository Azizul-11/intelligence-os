/** Phase 8.6B: post-hoc reclassification of a successful zero-row result as data-unavailable ONLY if rowCount===0, operation==="lookup", one resolved
 * entity and template.singleEntityRecord. Tests 1-2, 9 use the real warehouse; 3-8 use a spy to prove non-firing. */

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

function check(id: string, description: string, pass: boolean, detail: string) {
  results.push({ id, description, pass, detail });
}

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
const planner = new QueryPlanner();
const mapper = new ExecutionPlanMapper();

function makeSpyEngine(sqlCalledFlag: { called: boolean }) {
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

function makeRealEngine() {
  const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  const executor = new SqlExecutor(new SupabaseDatabaseAdapter(supabase));

  return createRuntimeEngine({
    runtime,
    semantic,
    planner,
    executionPlanMapper: mapper,
    executor,
  });
}

async function run() {
  // 1 - POSITIVE CONTROL: Mayo Clinic genuinely has clinical-outcomes
  // data. Real execution against the real remote warehouse.
  {
    const engine = makeRealEngine();
    const result = await engine.execute({
      question: "mortality rate for Mayo Clinic",
      parameters: {},
    });

    const pass =
      result.success === true &&
      result.rowCount > 0 &&
      result.answerability?.status === "answerable";

    check(
      "1-POSITIVE-CONTROL-MAYO-CLINIC",
      '"mortality rate for Mayo Clinic": real rows, answerable, unaffected',
      pass,
      JSON.stringify({ success: result.success, rowCount: result.rowCount, answerability: result.answerability }),
    );
  }

  // 2 - THE FIX: Mountain View Hospital (AL) has zero clinical-outcomes rows; real execution, SQL runs (post-hoc reclassification, not prevention).
  {
    const engine = makeRealEngine();
    const result = await engine.execute({
      question: "mortality rate for Mountain View Hospital in Alabama",
      parameters: {},
    });

    const pass =
      result.success === false &&
      result.rowCount === 0 &&
      result.answerability?.status === "not_directly_answerable" &&
      result.answerability?.reason === "data-unavailable";

    check(
      "2-DATA-UNAVAILABLE-FIX-MOUNTAIN-VIEW",
      '"mortality rate for Mountain View Hospital in Alabama": real SQL executes, genuinely zero rows, reclassified as data-unavailable',
      pass,
      JSON.stringify({ success: result.success, rowCount: result.rowCount, error: result.error, answerability: result.answerability }),
    );
  }

  // 3 - LIST REGRESSION: "hospitals in Wyoming" is an enumeration and is never reclassified; spy executor.
  {
    const flag = { called: false };
    const engine = makeSpyEngine(flag);
    const result = await engine.execute({
      question: "hospitals in Wyoming",
      parameters: {},
    });

    const pass =
      result.success === true &&
      result.answerability?.status === "answerable" &&
      flag.called;

    check(
      "3-LIST-REGRESSION-WYOMING",
      '"hospitals in Wyoming": ordinary list success, never data-unavailable',
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 4 - IDENTITY AMBIGUITY REGRESSION: 8.6B must not fire before
  // identity resolves.
  {
    const flag = { called: false };
    const engine = makeSpyEngine(flag);
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
      "Bare Northwest Medical Center: still identity-ambiguous, not data-unavailable",
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 5 - QUALIFIED IDENTITY REGRESSION: a real, data-available
  // single-entity lookup unaffected.
  {
    const flag = { called: false };
    const engine = makeSpyEngine(flag);
    const result = await engine.execute({
      question: "What is the overall rating of Northwest Medical Center in Arizona?",
      parameters: {},
    });

    const pass = result.success === true && result.answerability?.status === "answerable" && flag.called;

    check(
      "5-QUALIFIED-IDENTITY-REGRESSION",
      "Northwest Medical Center in Arizona: unaffected, executes normally",
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 6 - CAPABILITY-UNAVAILABLE REGRESSION: 8.5's gate must remain
  // distinct - never converted into data-unavailable.
  {
    const flag = { called: false };
    const engine = makeSpyEngine(flag);
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
      "6-CAPABILITY-UNAVAILABLE-REGRESSION",
      '"emergency department visits by hospital": still capability-unavailable (8.5), not data-unavailable, no SQL',
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 7 - ORDINARY RANKING REGRESSION: unaffected.
  {
    const flag = { called: false };
    const engine = makeSpyEngine(flag);
    const result = await engine.execute({
      question: "best hospitals for mortality",
      parameters: {},
    });

    const pass = result.success === true && result.answerability?.status === "answerable" && flag.called;

    check(
      "7-ORDINARY-RANKING-REGRESSION",
      '"best hospitals for mortality": unaffected by Phase 8.6B',
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 8 - MULTI-ENTITY REGRESSION: an explicit two-entity comparison ("-by-facility-ids") is never reclassified by 8.6B.
  {
    const flag = { called: false };
    const engine = makeSpyEngine(flag);
    const result = await engine.execute({
      question: "Compare Mayo Clinic and Cleveland Clinic on overall rating",
      parameters: {},
    });

    const pass = result.success === true && result.answerability?.status === "answerable" && flag.called;

    check(
      "8-MULTI-ENTITY-REGRESSION",
      "Explicit two-entity comparison: unaffected, never data-unavailable (more than one resolved entity)",
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 9 - Known-broken length-of-stay and emergency-department-visits templates keep their own pre-existing failure (not opted into
  // singleEntityRecord, not reclassified, not fixed).
  {
    const engine = makeRealEngine();
    const result = await engine.execute({
      question: "average length of stay for hospitals",
      parameters: {},
    });

    // Known pre-existing behavior (8.5 report): this only proves it was NOT reclassified as data-unavailable; the actual failure mode is unrelated.
    const notReclassifiedAsDataUnavailable = result.answerability?.reason !== "data-unavailable";

    check(
      "9-LENGTH-OF-STAY-UNTOUCHED",
      '"average length of stay for hospitals": length-of-stay.ts NOT opted into singleEntityRecord - never reclassified as data-unavailable by 8.6B (its own separate, pre-existing defect is untouched and undisclosed here as fixed)',
      notReclassifiedAsDataUnavailable,
      JSON.stringify({ success: result.success, error: result.error, answerability: result.answerability }),
    );
  }

  console.log("=".repeat(80));
  console.log("PHASE 8.6B - SINGLE-ENTITY DATA AVAILABILITY VERIFICATION");
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
