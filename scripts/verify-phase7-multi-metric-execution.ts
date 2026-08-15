/**
 * Phase 7: Multi-Metric Runtime Execution Verification
 *
 * Exercises the REAL end-to-end pipeline against real warehouse data:
 * Semantic -> QueryPlanner -> ExecutionPlanMapper -> RuntimeEngine ->
 * SqlExecutor -> SupabaseDatabaseAdapter -> Postgres.
 *
 * No mocked runtime. Uses the same credential pattern as the existing
 * ingest/semantic scripts (scripts/shared/supabase.ts, env-driven,
 * service-role key from .env - never hardcoded).
 */

import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { QueryPlanner, ExecutionPlanMapper } from "../packages/query-planner/src/index";
import { SqlExecutor, SupabaseDatabaseAdapter } from "../packages/sql-executor/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import type { RuntimeEngine } from "../packages/runtime-engine/src/runtime-engine";
import type { DomainRuntime } from "../packages/domain-runtime/src/runtime/domain-runtime";
import { supabase } from "./shared/supabase";

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
const planner = new QueryPlanner();
const executionPlanMapper = new ExecutionPlanMapper();
const executor = new SqlExecutor(new SupabaseDatabaseAdapter(supabase));

function buildEngine(rt: DomainRuntime): RuntimeEngine {
  return createRuntimeEngine({
    runtime: rt,
    semantic,
    planner,
    executionPlanMapper,
    executor,
  });
}

const engine = buildEngine(runtime);

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

async function main() {
  // ===== A: existing single metric, must remain unchanged =====
  {
    const query = "highest rated hospitals";
    const result = await engine.execute({ question: query, parameters: {} });
    const rows = result.rows as Record<string, unknown>[];

    const pass =
      result.success === true &&
      result.rowCount === 10 &&
      rows.length === 10 &&
      rows.every((r) => "overall_rating" in r) &&
      rows.every((r) => !("mort_measures_better" in r));

    check(
      "A",
      `Single metric unchanged ("${query}") - 10 rows, no secondary fields`,
      pass,
      `success=${result.success}, rowCount=${result.rowCount}, sampleRow=${JSON.stringify(rows[0])}`,
    );
  }

  // ===== B: two metrics, no filter =====
  {
    const query = "Which hospitals have the best overall rating and lowest mortality?";
    const result = await engine.execute({ question: query, parameters: {} });
    const rows = result.rows as Record<string, unknown>[];

    const pass =
      result.success === true &&
      rows.length > 0 &&
      rows.every((r) => "overall_rating" in r) &&
      rows.some((r) => "mort_measures_better" in r);

    check(
      "B",
      `Two metrics, no filter ("${query}")`,
      pass,
      `success=${result.success}, rowCount=${result.rowCount}, sampleRow=${JSON.stringify(rows[0])}`,
    );
  }

  // ===== C: reverse order =====
  {
    const query = "Which hospitals have the lowest mortality and best overall rating?";
    const result = await engine.execute({ question: query, parameters: {} });
    const rows = result.rows as Record<string, unknown>[];

    const pass =
      result.success === true &&
      rows.length > 0 &&
      rows.every((r) => "mort_measures_better" in r) &&
      rows.some((r) => "overall_rating" in r);

    check(
      "C",
      `Reverse order ("${query}") - primary is mortality, secondary is rating, both present`,
      pass,
      `success=${result.success}, rowCount=${result.rowCount}, sampleRow=${JSON.stringify(rows[0])}`,
    );
  }

  // ===== D: three metrics =====
  {
    const query =
      "Which hospitals have the best overall rating, lowest mortality, and lowest readmission?";
    const result = await engine.execute({ question: query, parameters: {} });
    const rows = result.rows as Record<string, unknown>[];

    const pass =
      result.success === true &&
      rows.length > 0 &&
      rows.every((r) => "overall_rating" in r) &&
      rows.some((r) => "mort_measures_better" in r) &&
      rows.some((r) => "readm_measures_better" in r);

    check(
      "D",
      `Three metrics ("${query}") - all three present`,
      pass,
      `success=${result.success}, rowCount=${result.rowCount}, sampleRow=${JSON.stringify(rows[0])}`,
    );
  }

  // ===== D2: primary metric ordering is preserved =====
  {
    const query = "Which hospitals have the best overall rating and lowest mortality?";
    const result = await engine.execute({ question: query, parameters: {} });
    const rows = result.rows as { overall_rating?: string | null }[];

    let orderedCorrectly = true;
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i]?.overall_rating;
      const b = rows[i + 1]?.overall_rating;
      if (a != null && b != null && Number(a) < Number(b)) {
        orderedCorrectly = false;
        break;
      }
    }

    check(
      "D2",
      "Primary metric ordering preserved (overall_rating descending, unaffected by secondary enrichment)",
      result.success === true && orderedCorrectly,
      `ratings in order: ${JSON.stringify((result.rows as any[]).map((r) => r.overall_rating))}`,
    );
  }

  // ===== E: Texas (avoiding the pre-existing "hospitals in" alias collision) =====
  {
    const query =
      "Which hospitals located in Texas have the best overall rating and lowest mortality?";
    const result = await engine.execute({ question: query, parameters: {} });
    const rows = result.rows as Record<string, unknown>[];

    const pass =
      result.success === true &&
      rows.length > 0 &&
      rows.every((r) => r.state === "TX") &&
      rows.every((r) => "overall_rating" in r) &&
      rows.some((r) => "mort_measures_better" in r);

    check(
      "E",
      `Texas filter + two metrics ("${query}") - state=TX, both metrics, facility_id-based join`,
      pass,
      `success=${result.success}, rowCount=${result.rowCount}, sampleRow=${JSON.stringify(rows[0])}`,
    );
  }

  // ===== F: original natural phrasing - observe only, not required to pass =====
  {
    const query = "Which hospitals in Texas have the best overall rating and lowest mortality?";
    const semanticResult = semantic.resolve(query);
    const metrics = semanticResult.matches.filter((m) => m.semanticType === "metric");
    console.log("\n[F] OBSERVATION ONLY (pre-existing alias collision, not fixed by Phase 7):");
    console.log(
      `  metrics detected: ${JSON.stringify(metrics.map((m) => m.canonicalKey))} (expect a spurious "hospital-list" entry from the pre-existing "hospitals in" alias, documented since Phase 6)`,
    );
  }

  // ===== 5: legitimately missing secondary value does not fail the request =====
  // Deterministic construction: force the secondary fetch to be missing one
  // of the primary identity values, by wrapping the real strategy with one
  // that drops the last identity value before building parameters. This
  // exercises the real merge code with a guaranteed row-level gap, rather
  // than hoping real data happens to have one.
  {
    const realStrategy = runtime.domain.executionStrategy;

    const shrinkingStrategy = {
      selectTemplate: realStrategy.selectTemplate.bind(realStrategy),
      resolveParameters: realStrategy.resolveParameters.bind(realStrategy),
      selectTemplateFromPlan: realStrategy.selectTemplateFromPlan?.bind(realStrategy),
      resolveParametersFromPlan: realStrategy.resolveParametersFromPlan?.bind(realStrategy),
      resultIdentityField: realStrategy.resultIdentityField,
      selectSecondaryMetricTemplate: realStrategy.selectSecondaryMetricTemplate?.bind(realStrategy),
      resolveSecondaryMetricParameters: (
        metric: any,
        executionPlan: any,
        identityValues: readonly unknown[],
      ) =>
        realStrategy.resolveSecondaryMetricParameters!(
          metric,
          executionPlan,
          identityValues.slice(0, -1), // deliberately drop one - guarantees a row-level gap
        ),
    };

    const shrunkRuntime: DomainRuntime = {
      ...runtime,
      domain: { ...runtime.domain, executionStrategy: shrinkingStrategy as any },
    };

    const shrunkEngine = buildEngine(shrunkRuntime);

    const query = "Which hospitals have the best overall rating and lowest mortality?";
    const result = await shrunkEngine.execute({ question: query, parameters: {} });
    const rows = (result.rows ?? []) as Record<string, unknown>[];

    const withMortality = rows.filter((r) => "mort_measures_better" in r).length;
    const withoutMortality = rows.length - withMortality;

    const pass = result.success === true && rows.length > 0 && withoutMortality >= 1;

    check(
      "5",
      "A row-level gap in secondary data (deliberately forced) does NOT fail the request",
      pass,
      `success=${result.success}, rows=${rows.length}, withMortality=${withMortality}, withoutMortality=${withoutMortality}`,
    );
  }

  // ===== 6a: secondary template not found -> whole request fails =====
  {
    const realStrategy = runtime.domain.executionStrategy;

    const brokenTemplateStrategy = {
      selectTemplate: realStrategy.selectTemplate.bind(realStrategy),
      resolveParameters: realStrategy.resolveParameters.bind(realStrategy),
      selectTemplateFromPlan: realStrategy.selectTemplateFromPlan?.bind(realStrategy),
      resolveParametersFromPlan: realStrategy.resolveParametersFromPlan?.bind(realStrategy),
      resultIdentityField: realStrategy.resultIdentityField,
      selectSecondaryMetricTemplate: () => "this-template-does-not-exist",
      resolveSecondaryMetricParameters: realStrategy.resolveSecondaryMetricParameters?.bind(realStrategy),
    };

    const brokenRuntime: DomainRuntime = {
      ...runtime,
      domain: { ...runtime.domain, executionStrategy: brokenTemplateStrategy as any },
    };

    const brokenEngine = buildEngine(brokenRuntime);

    const query = "Which hospitals have the best overall rating and lowest mortality?";
    const result = await brokenEngine.execute({ question: query, parameters: {} });

    const pass =
      result.success === false &&
      result.rows.length === 0 &&
      result.rowCount === 0 &&
      !!result.error &&
      result.error.includes("mortality-rate");

    check(
      "6a",
      "Secondary template not found -> ENTIRE request fails (success=false, rows=[])",
      pass,
      `success=${result.success}, rowCount=${result.rowCount}, error=${result.error}`,
    );
  }

  // ===== 6b: secondary query execution fails -> whole request fails =====
  {
    const realStrategy = runtime.domain.executionStrategy;

    const brokenExecutionStrategy = {
      selectTemplate: realStrategy.selectTemplate.bind(realStrategy),
      resolveParameters: realStrategy.resolveParameters.bind(realStrategy),
      selectTemplateFromPlan: realStrategy.selectTemplateFromPlan?.bind(realStrategy),
      resolveParametersFromPlan: realStrategy.resolveParametersFromPlan?.bind(realStrategy),
      resultIdentityField: realStrategy.resultIdentityField,
      // Points at a real template that requires a DIFFERENT required
      // parameter (:hospitalId) than what gets supplied - the executor's
      // own required-parameter check will legitimately fail this query.
      selectSecondaryMetricTemplate: () => "hospital-overall-rating",
      resolveSecondaryMetricParameters: realStrategy.resolveSecondaryMetricParameters?.bind(realStrategy),
    };

    const brokenRuntime: DomainRuntime = {
      ...runtime,
      domain: { ...runtime.domain, executionStrategy: brokenExecutionStrategy as any },
    };

    const brokenEngine = buildEngine(brokenRuntime);

    const query = "Which hospitals have the best overall rating and lowest mortality?";
    const result = await brokenEngine.execute({ question: query, parameters: {} });

    const pass =
      result.success === false &&
      result.rows.length === 0 &&
      result.rowCount === 0 &&
      !!result.error &&
      result.error.includes("mortality-rate");

    check(
      "6b",
      "Secondary query execution fails -> ENTIRE request fails (success=false, rows=[])",
      pass,
      `success=${result.success}, rowCount=${result.rowCount}, error=${result.error}`,
    );
  }

  console.log("\n" + "=".repeat(80));
  console.log("PHASE 7 MULTI-METRIC EXECUTION VERIFICATION");
  console.log("=".repeat(80));

  for (const r of results) {
    console.log(`\n[${r.id}] ${r.description}`);
    console.log(`  ${r.detail}`);
    console.log(r.pass ? "  ✅ PASS" : "  ❌ FAIL");
  }

  const total = results.length;
  const passed = results.filter((r) => r.pass).length;

  console.log("\n" + "=".repeat(80));
  console.log(`Total: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log("=".repeat(80));

  if (passed !== total) {
    console.log("\n❌ PHASE 7 MULTI-METRIC EXECUTION VERIFICATION: FAILED");
    process.exit(1);
  } else {
    console.log("\n✅ PHASE 7 MULTI-METRIC EXECUTION VERIFICATION: ALL TESTS PASSED");
  }
}

main().catch((error) => {
  console.error("FATAL ERROR:", error);
  process.exit(1);
});
