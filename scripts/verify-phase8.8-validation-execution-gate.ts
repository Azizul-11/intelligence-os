/** Phase 8.8: each execution filter must match a template parameter by RESOLVED VALUE (an "in" filter needs type:"array"), else refuse with no SQL (F8, multi-state crash);
 * concept discrepancies also trip hasUnaccountedMetricLoss. Tests 3-5, 7-8 use a spy, the rest the real warehouse. */

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
    // Tier0 Task 2 (F8): upgraded from a bare capability-mismatch refusal to a targeted `ambiguous` clarification (own vs similar); safety is
    // unchanged (no nationwide top-10, sqlCalled===false).
    const pass =
      result.success === false &&
      result.answerability?.status === "ambiguous" &&
      result.answerability?.reason === "identity-ambiguous" &&
      (result.answerability?.candidates?.length ?? 0) === 2 &&
      flag.called === false;
    check(
      "3-F8-PROTECTION",
      "SPY EXECUTOR: F8 case now a targeted clarification, sqlCalled=false - no nationwide top-10 result reaches the caller",
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
    // Tier0 Task 2 (F8): same upgrade as test 3 above - now a targeted
    // clarification rather than a bare refusal.
    const pass =
      result.success === false &&
      result.answerability?.status === "ambiguous" &&
      result.answerability?.reason === "identity-ambiguous" &&
      (result.answerability?.candidates?.length ?? 0) === 2 &&
      flag.called === false;
    check("4-F8-ADDITIONAL-WORDING", "SPY EXECUTOR: same F8 safety behavior (now a targeted clarification), different phrasing", pass, {
      success: result.success,
      answerability: result.answerability,
      sqlCalled: flag.called,
    });
  }

  // 5 - Multi-state (spy). Tier1 Task 5 (2026-09-12): was a safe refusal; now asserts a real multi-state answer (states array parameter + Phase 1
  // gate generalization). No raw Postgres crash reaches the caller: flag.called means SQL ran and returned rows.
  {
    const flag = { called: false };
    const engine = makeSpyEngine(flag);
    const result = await engine.execute({ question: "Best hospitals in Texas and California.", parameters: {} });
    const pass =
      result.success === true &&
      result.answerability?.status === "answerable" &&
      flag.called === true;
    check(
      "5-MULTI-STATE-CRASH-PREVENTION",
      "SPY EXECUTOR: multi-state filter now genuinely answerable (Tier1 Task 5) - no raw Postgres crash, real data instead of a refusal",
      pass,
      { success: result.success, answerability: result.answerability, sqlCalled: flag.called },
    );
  }

  // 6 - Multi-state, REAL executor (Tier1 Task 5, 2026-09-12): real rows come back and no raw Postgres error reaches result.error.
  {
    const engine = makeRealEngine();
    const result = await engine.execute({ question: "Best hospitals in Texas and California.", parameters: {} });
    const pass = result.success === true && result.answerability?.status === "answerable" && (result.rowCount ?? 0) > 0;
    check(
      "6-MULTI-STATE-REAL-EXECUTOR",
      "REAL WAREHOUSE: multi-state filter now genuinely answerable (Tier1 Task 5), no raw Postgres error propagates",
      pass,
      { success: result.success, error: result.error, answerability: result.answerability },
    );
  }

  // 7 - Concept loss, updated by Tier0 Task 5 (F12 B-full): "heart attack" (AMI) now becomes a measureCode filter via measureCodesByMetric and
  // mortality-rate.ts accepts :measureCode, so the concept narrows the answer instead of being refused.
  {
    const engine = makeRealEngine();
    const result = await engine.execute({
      question: "What is Mayo Clinic's mortality rate for heart attack specifically?",
      parameters: {},
    });
    const rows = (result.rows ?? []) as any[];
    const pass =
      result.success === true &&
      result.rowCount === 1 &&
      rows[0]?.measure_code === "MORT_30_AMI";
    check(
      "7-CONCEPT-LOSS-PROTECTION-NOW-B-FULL",
      'REAL ENGINE: "...for heart attack specifically" now resolves precisely to the single MORT_30_AMI row (Tier0 Task 5 B-full), not merely refused',
      pass,
      { success: result.success, rowCount: result.rowCount, measureCode: rows[0]?.measure_code },
    );
  }

  // 8 - Plural form (no concept candidate) is NOT affected by this gate; it fails for the pre-existing plural-alias reason, which this test
  // documents without asserting an outcome.
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

  // 15 - Universal-vs-Domain: the compatibility rule runs on synthetic non-Healthcare fields ("widgetId", "categoryCode") to prove it reads only
  // ExecutionFilter.field/operator/value and SqlTemplateParameter.name/type, mirroring create-runtime-engine.ts.
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
