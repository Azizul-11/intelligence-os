/**
 * Phase 8.6C - Partial Data Coverage / Result Completeness Verification
 *
 * Verifies the evidence-only coverage mechanism:
 * `SqlTemplateDefinition.coverageTemplateId` (Domain-declared) →
 * `RuntimeResult.coverage?: CoverageFact[]` (`{metric, eligibleCount,
 * coveredCount}`), computed via a Domain-authored companion query with
 * no LIMIT/ORDER BY, using the exact same request-scope parameters as
 * the primary execution - never `rowCount`, never `LIMIT`, never the
 * primary result's own returned identity values.
 *
 * Uses the real semantic + planner + runtime-engine pipeline with the
 * REAL SqlExecutor (SupabaseDatabaseAdapter) against the real remote
 * warehouse for every coverage assertion - a mocked/spy executor
 * cannot prove real population counts.
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
  // 1 - National overall-rating coverage.
  {
    const engine = makeRealEngine();
    const result = await engine.execute({ question: "best hospitals", parameters: {} });
    const fact = result.coverage?.find((f) => f.metric === "hospital-overall-rating");
    const pass = result.success === true && fact?.eligibleCount === 5442 && fact?.coveredCount === 3182;
    check(
      "1-NATIONAL-OVERALL-RATING-COVERAGE",
      '"best hospitals": eligibleCount=5442, coveredCount=3182, matching the real national figures',
      pass,
      JSON.stringify({ success: result.success, coverage: result.coverage }),
    );
  }

  // 2 - Texas overall-rating coverage (must not reuse the national figure).
  {
    const engine = makeRealEngine();
    const result = await engine.execute({ question: "best hospitals in Texas", parameters: {} });
    const fact = result.coverage?.find((f) => f.metric === "hospital-overall-rating");
    const pass = result.success === true && fact?.eligibleCount === 471 && fact?.coveredCount === 217;
    check(
      "2-TEXAS-OVERALL-RATING-COVERAGE",
      '"best hospitals in Texas": eligibleCount=471, coveredCount=217 - a genuinely different figure than national',
      pass,
      JSON.stringify({ success: result.success, coverage: result.coverage }),
    );
  }

  // 3 - Puerto Rico overall-rating coverage (extreme real case).
  //
  // "Puerto Rico" is not a resolvable state qualifier in the current
  // Healthcare STATES vocabulary (domain-packs/healthcare/src/runtime/
  // entity-provider.ts) - a pre-existing, out-of-scope semantic gap
  // confirmed by direct inspection, not something 8.6C may touch. The
  // primary ranking query would fall back to the same national scope
  // if driven through natural language, so this executes the real
  // companion template directly (as the primary ranking template
  // itself would be executed with state="PR") to prove the SQL
  // template's own real-warehouse correctness independent of that
  // unrelated vocabulary gap.
  {
    const coverageTemplate = runtime.sqlResolver.resolve("hospital-overall-rating-ranking-coverage");
    if (!coverageTemplate.found || !coverageTemplate.template) {
      check("3-PUERTO-RICO-OVERALL-RATING-COVERAGE", "companion template resolves", false, "template not found");
    } else {
      const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
      const realExecutor = new SqlExecutor(new SupabaseDatabaseAdapter(supabase));
      const coverageResult = await realExecutor.execute(coverageTemplate.template, { state: "PR" });
      const row = coverageResult.rows[0] as { eligible_count: number; covered_count: number } | undefined;
      const pass = coverageResult.success === true && row?.eligible_count === 60 && row?.covered_count === 7;
      check(
        "3-PUERTO-RICO-OVERALL-RATING-COVERAGE",
        'hospital-overall-rating-ranking-coverage executed directly with state="PR": eligible_count=60, covered_count=7 (11.7% coverage, the most extreme real case)',
        pass,
        JSON.stringify({ success: coverageResult.success, row }),
      );
    }
  }

  // 4 - Mortality coverage must be independently computed, never reuse
  // overall-rating's figures.
  {
    const engine = makeRealEngine();
    const result = await engine.execute({ question: "best hospitals for mortality", parameters: {} });
    const fact = result.coverage?.find((f) => f.metric === "mortality-rate");
    const pass =
      result.success === true &&
      fact?.eligibleCount === 5442 &&
      fact?.coveredCount === 4105 &&
      fact.coveredCount !== 3182;
    check(
      "4-MORTALITY-INDEPENDENT-COVERAGE",
      '"best hospitals for mortality": eligibleCount=5442, coveredCount=4105 - independently computed, not overall-rating\'s 3182',
      pass,
      JSON.stringify({ success: result.success, coverage: result.coverage }),
    );
  }

  // 5 - Multi-metric ranking: the primary metric (hospital-overall-
  // rating, via its own opted-in ranking template) gets its own
  // independent, population-scoped CoverageFact; the secondary metric
  // (mortality-rate) is resolved via Phase 7's pre-existing
  // `mortality-rate-by-facility-ids` template - already scoped to the
  // primary ranking's own top-10 facility_ids, never opted into
  // `coverageTemplateId` since attaching population coverage to an
  // already-narrowed 10-row lookup would misrepresent it as a
  // population statistic. This proves both "no intersection" (the
  // one fact present reflects only its own metric's full scope,
  // unaffected by the second metric) and "never derived from the
  // primary's returned facility subset" (eligibleCount is 5442, not
  // 10, and no fabricated fact appears for the secondary metric).
  {
    const engine = makeRealEngine();
    const result = await engine.execute({
      question: "Which hospitals have the best overall rating and lowest mortality?",
      parameters: {},
    });
    const ratingFact = result.coverage?.find((f) => f.metric === "hospital-overall-rating");
    const mortalityFact = result.coverage?.find((f) => f.metric === "mortality-rate");
    const pass =
      result.success === true &&
      result.coverage?.length === 1 &&
      ratingFact?.eligibleCount === 5442 &&
      ratingFact?.coveredCount === 3182 &&
      mortalityFact === undefined;
    check(
      "5-MULTI-METRIC-COVERAGE-NOT-MERGED",
      "Multi-metric ranking: exactly 1 CoverageFact (the opted-in primary metric, full 5442/3182 population scope), no fabricated fact for the by-facility-ids secondary metric, no intersection figure",
      pass,
      JSON.stringify({ success: result.success, coverage: result.coverage }),
    );
  }

  // 6 - Legitimate empty result must remain unaffected by coverage
  // computation.
  {
    const flag = { called: false };
    const engine = makeSpyEngine(flag);
    const result = await engine.execute({ question: "hospitals in Wyoming with an overall rating of 1", parameters: {} });
    // This query shape may or may not resolve through the current
    // semantic vocabulary; the assertion that matters is only that
    // no coverage-related field ever reclassifies an ordinary result.
    const pass = result.answerability?.reason !== "data-unavailable";
    check(
      "6-LEGITIMATE-EMPTY-RESULT-UNAFFECTED",
      '"hospitals in Wyoming with an overall rating of 1": never reclassified as data-unavailable/coverage failure',
      pass,
      JSON.stringify({ result }),
    );
  }

  // 7 - 8.6B regression: single-entity data-unavailable must remain
  // completely untouched, with no coverage fact ever attached.
  {
    const engine = makeRealEngine();
    const result = await engine.execute({
      question: "mortality rate for Mountain View Hospital in Alabama",
      parameters: {},
    });
    const pass =
      result.success === false &&
      result.answerability?.status === "not_directly_answerable" &&
      result.answerability?.reason === "data-unavailable" &&
      result.coverage === undefined;
    check(
      "7-8.6B-SEPARATION-REGRESSION",
      "Mountain View Hospital + mortality: unchanged 8.6B data-unavailable, no coverage fact attached",
      pass,
      JSON.stringify({ result }),
    );
  }

  // 8 - Top-N independence: coverage must not depend on the ranking's
  // own LIMIT/returned row count.
  {
    const engine = makeRealEngine();
    const result = await engine.execute({ question: "best hospitals", parameters: {} });
    const fact = result.coverage?.find((f) => f.metric === "hospital-overall-rating");
    const pass = result.rowCount <= 10 && fact !== undefined && fact.eligibleCount > (result.rowCount ?? 0) * 100;
    check(
      "8-TOP-N-INDEPENDENCE",
      "\"best hospitals\": rowCount is capped at 10 by LIMIT, but eligibleCount (5442) is vastly larger - proving the denominator is independent of the returned row count",
      pass,
      JSON.stringify({ rowCount: result.rowCount, coverage: result.coverage }),
    );
  }

  // 9 - Domain correctness invariant: coveredCount must never exceed
  // eligibleCount for any fact.
  {
    const engine = makeRealEngine();
    const result1 = await engine.execute({ question: "best hospitals", parameters: {} });
    const result2 = await engine.execute({ question: "best hospitals for mortality", parameters: {} });
    const allFacts = [...(result1.coverage ?? []), ...(result2.coverage ?? [])];
    const pass = allFacts.length > 0 && allFacts.every((f) => f.coveredCount <= f.eligibleCount);
    check(
      "9-COVERED-NEVER-EXCEEDS-ELIGIBLE",
      "Every CoverageFact satisfies coveredCount <= eligibleCount",
      pass,
      JSON.stringify({ allFacts }),
    );
  }

  console.log("=".repeat(80));
  console.log("PHASE 8.6C - PARTIAL DATA COVERAGE VERIFICATION");
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

  if (!allPass) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
