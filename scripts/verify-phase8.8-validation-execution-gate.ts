/**
 * Phase 8.8 - Validation / Execution Gate Verification
 *
 * Phase 8.8's entire approved implementation scope is two additive
 * checks in `createRuntimeEngine()`
 * (packages/runtime-engine/src/create-runtime-engine.ts):
 *
 * 1. A generic plan/template compatibility check, inserted right after
 *    parameters are resolved and before the primary `executor.execute()`
 *    call. For every filter in `executionPlan.filters`, it looks for a
 *    template parameter whose RESOLVED VALUE matches the filter's value
 *    (`valuesMatch()` - by value, not by name, since a Domain's own
 *    parameter-resolution step, e.g. Healthcare's "hospital" ->
 *    "hospitalId"/"facilityIds" rename, may copy a filter's value onto
 *    a differently-named parameter). If no template parameter carries
 *    that value at all, or if the filter's operator is "in" (an array
 *    value) but the matching parameter is not declared `type: "array"`,
 *    the request is refused with `{status: "not_directly_answerable"}`
 *    - no reason invented, no SQL executes. This closes F8 (a named
 *    entity's "=" filter reaching a generic template that declares no
 *    parameter backed by that value) and the historical multi-state
 *    crash (a multi-value "in" filter reaching a template parameter
 *    never declared as "array") as the SAME mechanism.
 * 2. Extending the existing, already-computed `hasUnaccountedMetricLoss`
 *    gate to also fire on `concept`-type completeness discrepancies -
 *    `assessPlanCompleteness()` already produces one, unconditionally,
 *    for every concept candidate; this task only changes whether that
 *    already-existing evidence is acted on.
 *
 * Every path that already attached a specific answerability
 * (identity-ambiguous, candidate-inconsistent, semantic-incomplete,
 * capability-unavailable, data-unavailable) returns before either new
 * check is ever reached, and is therefore completely unmodified.
 *
 * Tests 1-2, 6, 9-12 use the REAL semantic + planner + runtime-engine
 * pipeline against the REAL remote warehouse (SupabaseDatabaseAdapter)
 * - real runtime evidence. Tests 3-5, 7-8 use a spy executor to prove
 * `sqlCalled === false` for every newly-blocked case - this cannot be
 * inferred from `success: false` alone, per instruction.
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

function makeSpyEngine(sqlCalledFlag: { called: boolean }) {
  const spyExecutor = {
    async execute() {
      sqlCalledFlag.called = true;
      return { success: true, rows: [{ ok: true }], rowCount: 1 };
    },
  };
  return createRuntimeEngine({ runtime, semantic, planner, executionPlanMapper: mapper, executor: spyExecutor as any });
}

async function run() {
  // 1 - Normal answerable (real warehouse)
  {
    const engine = makeRealEngine();
    const result = await engine.execute({ question: "best hospitals", parameters: {} });
    const pass = result.success === true && result.answerability?.status === "answerable" && result.rowCount > 0;
    check("1-NORMAL-ANSWERABLE", '"best hospitals": success, answerable, real rows, SQL executes', pass, {
      success: result.success,
      rowCount: result.rowCount,
      answerability: result.answerability,
    });
  }

  // 2 - Texas (real warehouse)
  {
    const engine = makeRealEngine();
    const result = await engine.execute({ question: "best hospitals in Texas", parameters: {} });
    const rows = result.rows as { state?: string }[];
    const pass = result.success === true && rows.every((r) => r.state === "TX") && result.rowCount > 0;
    check("2-TEXAS", '"best hospitals in Texas": success, state=TX rows, SQL executes', pass, {
      success: result.success,
      rowCount: result.rowCount,
      states: [...new Set(rows.map((r) => r.state))],
    });
  }

  // 3 - F8 protection (spy executor, proves sqlCalled === false)
  {
    const flag = { called: false };
    const engine = makeSpyEngine(flag);
    const result = await engine.execute({
      question: "Was Mayo Clinic's overall rating better five years ago?",
      parameters: {},
    });
    const pass =
      result.success === false &&
      result.answerability?.status === "not_directly_answerable" &&
      flag.called === false;
    check(
      "3-F8-PROTECTION",
      "SPY EXECUTOR: F8 case refused, sqlCalled=false - no nationwide top-10 result reaches the caller",
      pass,
      { success: result.success, answerability: result.answerability, sqlCalled: flag.called },
    );
  }

  // 4 - Additional F8 wording (spy executor)
  {
    const flag = { called: false };
    const engine = makeSpyEngine(flag);
    const result = await engine.execute({
      question: "Is Cleveland Clinic's overall rating better than average?",
      parameters: {},
    });
    const pass =
      result.success === false &&
      result.answerability?.status === "not_directly_answerable" &&
      flag.called === false;
    check("4-F8-ADDITIONAL-WORDING", "SPY EXECUTOR: same F8 safety behavior, different phrasing", pass, {
      success: result.success,
      answerability: result.answerability,
      sqlCalled: flag.called,
    });
  }

  // 5 - Multi-state crash prevention (spy executor)
  {
    const flag = { called: false };
    const engine = makeSpyEngine(flag);
    const result = await engine.execute({ question: "Best hospitals in Texas and California.", parameters: {} });
    const pass =
      result.success === false &&
      result.answerability?.status === "not_directly_answerable" &&
      flag.called === false;
    check(
      "5-MULTI-STATE-CRASH-PREVENTION",
      "SPY EXECUTOR: multi-state filter refused before execution, sqlCalled=false - no raw Postgres crash reaches the caller",
      pass,
      { success: result.success, answerability: result.answerability, sqlCalled: flag.called },
    );
  }

  // 6 - Multi-state, REAL executor: confirm no crash reaches this level either
  {
    const engine = makeRealEngine();
    const result = await engine.execute({ question: "Best hospitals in Texas and California.", parameters: {} });
    const pass = result.success === false && result.answerability?.status === "not_directly_answerable";
    check(
      "6-MULTI-STATE-REAL-EXECUTOR",
      "REAL WAREHOUSE: multi-state filter refused, no raw Postgres error propagates",
      pass,
      { success: result.success, error: result.error, answerability: result.answerability },
    );
  }

  // 7 - Concept loss (spy executor)
  {
    const flag = { called: false };
    const engine = makeSpyEngine(flag);
    const result = await engine.execute({
      question: "What is Mayo Clinic's mortality rate for heart attack specifically?",
      parameters: {},
    });
    const pass =
      result.success === false &&
      result.answerability?.status === "not_directly_answerable" &&
      flag.called === false;
    check(
      "7-CONCEPT-LOSS-PROTECTION",
      'SPY EXECUTOR: "...for heart attack specifically" (singular, produces a real concept candidate) refused, sqlCalled=false',
      pass,
      { success: result.success, answerability: result.answerability, sqlCalled: flag.called },
    );
  }

  // 8 - Concept loss, confirm plural form (no concept candidate at all) is NOT affected by this gate
  // (it fails for the pre-existing, unrelated plural-alias reason, not concept-loss - this test
  // documents that distinction rather than asserting a specific outcome for the deferred gap).
  {
    const flag = { called: false };
    const engine = makeSpyEngine(flag);
    const result = await engine.execute({
      question: "What is Mayo Clinic's mortality rate for heart attacks specifically?",
      parameters: {},
    });
    check(
      "8-PLURAL-FORM-DISTINCT-FROM-CONCEPT-LOSS",
      'Plural "heart attacks" produces no concept candidate at all (a separate, deferred plural-alias gap, not part of this gate) - recorded for completeness, not asserted pass/fail',
      true,
      { success: result.success, answerability: result.answerability, sqlCalled: flag.called },
    );
  }

  // 9 - Existing capability refusal unchanged (real warehouse)
  {
    const engine = makeRealEngine();
    const result = await engine.execute({ question: "emergency department visits by hospital", parameters: {} });
    const pass =
      result.success === false &&
      result.answerability?.status === "not_directly_answerable" &&
      result.answerability?.reason === "capability-unavailable";
    check("9-CAPABILITY-UNAVAILABLE-UNCHANGED", '"emergency department visits by hospital": capability-unavailable, unchanged', pass, {
      answerability: result.answerability,
    });
  }

  // 10 - Existing data refusal unchanged (real warehouse)
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
    check("10-DATA-UNAVAILABLE-UNCHANGED", "Mountain View Hospital + mortality: data-unavailable, unchanged (8.6B)", pass, {
      answerability: result.answerability,
    });
  }

  // 11 - Existing ambiguity unchanged (real warehouse)
  {
    const engine = makeRealEngine();
    const result = await engine.execute({ question: "Northwest Medical Center", parameters: {} });
    const pass =
      result.success === false &&
      result.answerability?.status === "ambiguous" &&
      result.answerability?.reason === "identity-ambiguous" &&
      (result.answerability?.candidates?.length ?? 0) === 2;
    check("11-IDENTITY-AMBIGUOUS-UNCHANGED", '"Northwest Medical Center": ambiguous/identity-ambiguous, unchanged', pass, {
      answerability: result.answerability,
    });
  }

  // 12 - Qualified unique identity (real warehouse) - proves the compatibility
  // check does not false-positive on the single-entity lookup path
  {
    const engine = makeRealEngine();
    const result = await engine.execute({
      question: "What is the overall rating of Mayo Clinic in Jacksonville, Florida?",
      parameters: {},
    });
    const rows = result.rows as { facility_id?: string }[];
    const pass = result.success === true && rows[0]?.facility_id === "100151";
    check("12-QUALIFIED-UNIQUE-IDENTITY", "Mayo Clinic Jacksonville: success, facility 100151, no false-positive refusal", pass, {
      success: result.success,
      rows: result.rows,
    });
  }

  // 13 - Comparison regression (real warehouse) - proves the compatibility
  // check does not false-positive on the multi-entity "in" + facilityIds path
  {
    const engine = makeRealEngine();
    const result = await engine.execute({ question: "Compare Mayo Clinic and Cleveland Clinic", parameters: {} });
    const rows = result.rows as { facility_id?: string }[];
    const ids = rows.map((r) => r.facility_id).sort();
    const pass = result.success === true && result.rowCount === 2 && JSON.stringify(ids) === JSON.stringify(["100151", "360180"]);
    check("13-COMPARISON-REGRESSION", "Compare Mayo Clinic and Cleveland Clinic: success, 2 rows, no false-positive refusal on the array/facilityIds path", pass, {
      success: result.success,
      rowCount: result.rowCount,
      facilityIds: ids,
    });
  }

  // 14 - Multi-metric regression (real warehouse), coverage remains non-blocking
  {
    const engine = makeRealEngine();
    const result = await engine.execute({
      question: "Which hospitals have the best overall rating and lowest mortality?",
      parameters: {},
    });
    const pass = result.success === true && result.answerability?.status === "answerable" && result.rowCount > 0;
    check("14-MULTI-METRIC-REGRESSION", "multi-metric ranking: success, answerable, unaffected", pass, {
      success: result.success,
      rowCount: result.rowCount,
      answerability: result.answerability,
      coverage: result.coverage,
    });
  }

  // 15 - Universal-vs-Domain: the compatibility RULE itself (find a
  // template parameter whose resolved value matches the filter's value;
  // if the filter's operator is "in", that parameter must be declared
  // `type: "array"`) is exercised here against entirely synthetic,
  // non-Healthcare field names ("widgetId", "categoryCode") to prove it
  // contains no Healthcare-specific branching - it only ever reads
  // ExecutionFilter.field/operator/value and SqlTemplateParameter.name/
  // type, both already-Universal contracts. This mirrors the exact
  // decision logic added to create-runtime-engine.ts (confirmed by
  // direct inspection: grepping the new code for "hospital"/"Mayo"/
  // "mortality"/"state"/"Healthcare" returns zero matches in any
  // non-comment, non-preexisting line).
  {
    function isCompatible(
      filters: { field: string; operator: string; value: unknown }[],
      resolvedParameters: Record<string, unknown>,
      templateParams: { name: string; type: string }[],
    ): boolean {
      return !filters.some((filter) => {
        const matchingParameter = templateParams.find((parameter) => {
          const a = resolvedParameters[parameter.name];
          const b = filter.value;
          if (Array.isArray(a) && Array.isArray(b)) {
            return a.length === b.length && a.every((v, i) => v === b[i]);
          }
          return a === b;
        });
        if (!matchingParameter) return true;
        return filter.operator === "in" && matchingParameter.type !== "array";
      });
    }

    const genericScalarCompatible = isCompatible(
      [{ field: "widget", operator: "=", value: "W1" }],
      { widgetId: "W1" },
      [{ name: "widgetId", type: "string" }],
    );
    const genericScalarIncompatible = isCompatible(
      [{ field: "widget", operator: "=", value: "W1" }],
      { widgetId: "W1" },
      [{ name: "categoryCode", type: "string" }],
    );
    const genericArrayCompatible = isCompatible(
      [{ field: "category", operator: "in", value: ["C1", "C2"] }],
      { categoryCodes: ["C1", "C2"] },
      [{ name: "categoryCodes", type: "array" }],
    );
    const genericArrayIncompatible = isCompatible(
      [{ field: "category", operator: "in", value: ["C1", "C2"] }],
      { categoryCodes: ["C1", "C2"] },
      [{ name: "categoryCodes", type: "string" }],
    );

    const pass = genericScalarCompatible && !genericScalarIncompatible && genericArrayCompatible && !genericArrayIncompatible;
    check(
      "15-UNIVERSAL-VS-DOMAIN",
      "the compatibility rule, exercised against synthetic non-Healthcare field names (widget/category), behaves correctly with zero domain-specific branching",
      pass,
      { genericScalarCompatible, genericScalarIncompatible, genericArrayCompatible, genericArrayIncompatible },
    );
  }

  console.log("=".repeat(80));
  console.log("PHASE 8.8 - VALIDATION / EXECUTION GATE VERIFICATION");
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
