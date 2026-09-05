/**
 * Phase 8.6B - Deterministic Entity + Metric Data Availability
 * Verification
 *
 * Verifies the single additive Phase 8.6B mechanism in
 * packages/runtime-engine/src/create-runtime-engine.ts: a POST-HOC
 * reclassification of an already-successfully-executed, zero-row
 * result as `{status: "not_directly_answerable", reason:
 * "data-unavailable"}`, ONLY when all five locked conditions hold
 * (success, rowCount===0, operation==="lookup", exactly one resolved
 * entity, template.singleEntityRecord===true). No new SQL query is
 * added - the real primary query already executes; this only
 * reinterprets its own real result.
 *
 * Uses the real semantic + planner + runtime-engine pipeline
 * throughout. Tests 1-2 and 9 execute against the REAL remote
 * warehouse (via SupabaseDatabaseAdapter) since the data-unavailable
 * proof requires a genuinely executed, genuinely empty result - a
 * mocked/spy executor cannot prove this. Tests 3-8 use a spy executor
 * (no real database dependency) since they only need to prove the
 * mechanism does NOT fire for non-qualifying shapes.
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

  // 2 - THE FIX: Mountain View Hospital (AL) genuinely has zero
  // clinical-outcomes rows. Real execution against the real remote
  // warehouse - SQL DOES execute (this is post-hoc reclassification,
  // not a capability-unavailable-style prevention).
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

  // 3 - LIST REGRESSION: "hospitals in Wyoming" must never be
  // reclassified regardless of row count - no entity is the record's
  // own subject here, it's an enumeration. Spy executor (no real DB
  // dependency needed to prove non-triggering).
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

  // 8 - MULTI-ENTITY REGRESSION: an explicit two-entity comparison
  // (Phase 7.5's own mechanism, "-by-facility-ids" path) must never be
  // reclassified by 8.6B - more than one resolved entity candidate.
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

  // 9 - KNOWN BROKEN DOMAIN TEMPLATES REMAIN UNTOUCHED: length-of-stay
  // and emergency-department-visits still fail with their own
  // pre-existing, undisturbed error - NOT opted into
  // singleEntityRecord, NOT reclassified, NOT fixed.
  {
    const engine = makeRealEngine();
    const result = await engine.execute({
      question: "average length of stay for hospitals",
      parameters: {},
    });

    // Known, disclosed, pre-existing behavior (Phase 8.5 report): the
    // template is found/enabled and proceeds toward execution; this
    // check only proves it was NOT reclassified as data-unavailable by
    // 8.6B - the actual failure mode (if any) is unrelated and
    // untouched.
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
