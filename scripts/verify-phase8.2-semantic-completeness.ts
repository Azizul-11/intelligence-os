/** Phase 8.2: assessPlanCompleteness() ignores metrics legitimately dropped by intent/fallback filtering but flags ones lost afterward; only a
 * metric-type discrepancy trips the new gate. Tests A/D/E are synthetic; the rest use the real Healthcare pack; no SQL. */

import { assessPlanCompleteness } from "../packages/query-planner/src/plan-completeness";
import type { SemanticCollections } from "../packages/query-planner/src/semantic-collections";
import type { ExecutionPlan } from "../packages/contracts/src/execution/execution-plan";
import type { SemanticCandidate } from "../packages/semantic/src/candidate/SemanticCandidate";

import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";

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

function metricCandidate(
  canonicalKey: string,
  overrides: Partial<SemanticCandidate> & { rankable?: boolean } = {},
): SemanticCandidate {
  const { rankable, ...rest } = overrides;
  return {
    phrase: canonicalKey,
    canonicalKey,
    semanticType: "metric",
    definition: {
      id: canonicalKey,
      name: canonicalKey,
      displayName: canonicalKey,
      rankable: rankable ?? true,
    } as any,
    confidence: 1,
    start: 0,
    end: 0,
    ...rest,
  };
}

// Synthetic, domain-neutral unit tests against assessPlanCompleteness()

// B - a metric legitimately filtered by filterMetricsForIntent() (not rankable for a ranking plan) is not a discrepancy.
{
  const rankableMetric = metricCandidate("metric-a", { rankable: true });
  const nonRankableMetric = metricCandidate("metric-b", { rankable: false });

  const rawCandidates: SemanticCandidate[] = [rankableMetric, nonRankableMetric];

  // Simulates QueryPlanner's finalCollections after filterMetricsForIntent()
  // removed the non-rankable candidate for a ranking intent.
  const plannedSemantic: SemanticCollections = {
    metrics: [rankableMetric],
    entities: [],
    dimensions: [],
    categories: [],
    benchmarks: [],
    relationships: [],
  };

  const plan: ExecutionPlan = {
    operation: "rank",
    metric: "metric-a",
    filters: [],
  };

  const report = assessPlanCompleteness(rawCandidates, plan, plannedSemantic);

  const pass = report.complete && report.discrepancies.length === 0;
  check(
    "B",
    "Metric filtered by filterMetricsForIntent() is not a discrepancy",
    pass,
    JSON.stringify(report),
  );
}

// C - a metric that survived filtering but is absent from the ExecutionPlan must stay a detectable discrepancy.
{
  const survivingMetric = metricCandidate("metric-a", { rankable: true });

  const rawCandidates: SemanticCandidate[] = [survivingMetric];

  const plannedSemantic: SemanticCollections = {
    metrics: [survivingMetric], // survived filtering
    entities: [],
    dimensions: [],
    categories: [],
    benchmarks: [],
    relationships: [],
  };

  // Deliberately does NOT carry "metric-a" - simulates an unaccounted-for
  // planning-representation loss.
  const plan: ExecutionPlan = {
    operation: "rank",
    metric: "some-other-metric",
    filters: [],
  };

  const report = assessPlanCompleteness(rawCandidates, plan, plannedSemantic);

  const hasMetricDiscrepancy = report.discrepancies.some(
    (d) => d.semanticType === "metric" && d.canonicalKey === "metric-a",
  );

  const pass = !report.complete && hasMetricDiscrepancy;
  check(
    "C",
    "Metric that survived filtering but is absent from ExecutionPlan remains a discrepancy",
    pass,
    JSON.stringify(report),
  );
}

// D - F12 concept candidates are always flagged but never gate execution (only metric-type discrepancies do).
{
  const conceptCandidate: SemanticCandidate = {
    phrase: "some-concept-phrase",
    canonicalKey: "some-concept",
    semanticType: "concept",
    definition: { id: "some-concept", name: "some-concept", displayName: "Some Concept" } as any,
    confidence: 1,
    start: 0,
    end: 0,
  };

  const rawCandidates: SemanticCandidate[] = [conceptCandidate];

  const plannedSemantic: SemanticCollections = {
    metrics: [],
    entities: [],
    dimensions: [],
    categories: [],
    benchmarks: [],
    relationships: [],
  };

  const plan: ExecutionPlan = { operation: "lookup", metric: "unrelated", filters: [] };

  const report = assessPlanCompleteness(rawCandidates, plan, plannedSemantic);

  const hasConceptDiscrepancy = report.discrepancies.some((d) => d.semanticType === "concept");
  const hasNoMetricDiscrepancy = !report.discrepancies.some((d) => d.semanticType === "metric");

  const pass = !report.complete && hasConceptDiscrepancy && hasNoMetricDiscrepancy;
  check(
    "D",
    "F12 (concept) discrepancy still detected, and never a metric-type discrepancy",
    pass,
    JSON.stringify(report),
  );
}

// E - F13 (category) preservation: same shape as D, for category.
{
  const categoryCandidate: SemanticCandidate = {
    phrase: "some-category-phrase",
    canonicalKey: "some-category",
    semanticType: "category",
    definition: { id: "some-category", name: "some-category", displayName: "Some Category" } as any,
    confidence: 1,
    start: 0,
    end: 0,
  };

  const rawCandidates: SemanticCandidate[] = [categoryCandidate];

  const plannedSemantic: SemanticCollections = {
    metrics: [],
    entities: [],
    dimensions: [],
    categories: [],
    benchmarks: [],
    relationships: [],
  };

  const plan: ExecutionPlan = { operation: "lookup", metric: "unrelated", filters: [] };

  const report = assessPlanCompleteness(rawCandidates, plan, plannedSemantic);

  const hasCategoryDiscrepancy = report.discrepancies.some((d) => d.semanticType === "category");
  const hasNoMetricDiscrepancy = !report.discrepancies.some((d) => d.semanticType === "metric");

  const pass = !report.complete && hasCategoryDiscrepancy && hasNoMetricDiscrepancy;
  check(
    "E",
    "F13 (category) discrepancy still detected, and never a metric-type discrepancy",
    pass,
    JSON.stringify(report),
  );
}

// Real end-to-end tests (semantic + planner, no SQL) with the Healthcare pack

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
const planner = new QueryPlanner();
const mapper = new ExecutionPlanMapper();

function assessRealQuery(question: string) {
  const semanticResult = semantic.resolve(question);
  const planResult = planner.createPlan(semanticResult, runtime.domain.metrics);

  if (!planResult.success || !planResult.plan) {
    return { semanticResult, planResult, executionPlan: null, completeness: null };
  }

  const executionPlan = mapper.map(planResult.plan);
  const completeness = assessPlanCompleteness(
    semanticResult.matches,
    executionPlan,
    planResult.plan.semantic,
  );

  return { semanticResult, planResult, executionPlan, completeness };
}

// A - "best hospitals for mortality" yields an explicit mortality candidate plus a fallback rating candidate; filterFallbackMetrics() suppresses the
// fallback, so the plan must stay complete.
{
  const { completeness } = assessRealQuery("best hospitals for mortality");
  const pass = completeness !== null && completeness.complete;
  check(
    "A",
    'Real query "best hospitals for mortality" (explicit + fallback metric) remains complete',
    pass,
    JSON.stringify(completeness),
  );
}

// Regression - a pure fallback idiom with no explicit metric must also stay complete.
{
  const { completeness } = assessRealQuery("best hospitals");
  const pass = completeness !== null && completeness.complete;
  check(
    "REG-1",
    'Regression: "best hospitals" (fallback idiom alone) remains complete',
    pass,
    JSON.stringify(completeness),
  );
}

// Regression - ordinary explicit-metric query remains complete.
{
  const { completeness } = assessRealQuery("highest rated hospitals");
  const pass = completeness !== null && completeness.complete;
  check(
    "REG-2",
    'Regression: "highest rated hospitals" remains complete',
    pass,
    JSON.stringify(completeness),
  );
}

async function runWiringTests() {
// Wiring proof of the create-runtime-engine.ts gate: a wrapped ExecutionPlanMapper simulates an unaccounted metric loss (it never occurs naturally)
// and a spy SqlExecutor proves SQL is never reached.
{
  let sqlExecutorCalled = false;

  const realMapper = new ExecutionPlanMapper();

  const droppingMapper = {
    map(queryPlan: any) {
      const plan = realMapper.map(queryPlan);
      // Simulate the plan silently losing its metric after mapping, through the real RuntimeEngine.execute() path.
      return { ...plan, metric: "simulated-missing-metric", metrics: undefined };
    },
  };

  const spyExecutor = {
    async execute() {
      sqlExecutorCalled = true;
      return { success: true, rows: [], rowCount: 0 };
    },
  };

  const engine = createRuntimeEngine({
    runtime,
    semantic,
    planner,
    executionPlanMapper: droppingMapper as unknown as ExecutionPlanMapper,
    executor: spyExecutor as any,
  });

  const result = await engine.execute({ question: "highest rated hospitals", parameters: {} });

  const pass =
    result.success === false &&
    result.answerability?.status === "not_directly_answerable" &&
    result.answerability?.reason === "plan-incomplete" &&
    !sqlExecutorCalled;

  check(
    "WIRING",
    "RuntimeEngine gate refuses a genuine metric loss and never calls SqlExecutor",
    pass,
    JSON.stringify({ result, sqlExecutorCalled }),
  );
}

// Wiring regression: the real mapper with an ordinary valid query must still execute (spy confirms SQL reached).
{
  let sqlExecutorCalled = false;

  const realMapper = new ExecutionPlanMapper();

  const spyExecutor = {
    async execute() {
      sqlExecutorCalled = true;
      return { success: true, rows: [{ ok: true }], rowCount: 1 };
    },
  };

  const engine = createRuntimeEngine({
    runtime,
    semantic,
    planner,
    executionPlanMapper: realMapper,
    executor: spyExecutor as any,
  });

  const result = await engine.execute({ question: "highest rated hospitals", parameters: {} });

  const pass = result.success === true && sqlExecutorCalled;

  check(
    "WIRING-REG",
    "RuntimeEngine still executes a valid query through the real, unmodified mapper",
    pass,
    JSON.stringify({ result, sqlExecutorCalled }),
  );
}

console.log("=".repeat(80));
console.log("PHASE 8.2 - SEMANTIC COMPLETENESS VERIFICATION");
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

runWiringTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
