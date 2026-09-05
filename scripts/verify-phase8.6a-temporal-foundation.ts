/**
 * Phase 8.6A - Universal Temporal Semantic Foundation Verification
 *
 * Verifies the single additive Phase 8.6A mechanism: a literal point-
 * year value (e.g. "2021") is now recognized as a TemporalCandidate,
 * kept entirely separate from `matches`/`SemanticCandidate` - a literal
 * year has no Domain-registered definition and is never looked up in
 * any registry (packages/semantic/src/temporal/temporal-resolver.ts).
 *
 * 8.6A introduces NO new answerability/runtime gate - every query here
 * is expected to resolve/execute (or fail to resolve) EXACTLY as it did
 * before this change. What is being proven is the presence/absence of
 * `semanticResult.temporalCandidates`, not any change in `success`,
 * `answerability`, or `sqlCalled`.
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
  // 1 - THE FIX: an explicit point-year survives semantic resolution as
  // a structured, separate temporal candidate.
  {
    const semanticResult = semantic.resolve("hospital mortality rate in 2021");

    const candidate = semanticResult.temporalCandidates?.[0];

    const pass =
      semanticResult.temporalCandidates !== undefined &&
      semanticResult.temporalCandidates.length === 1 &&
      candidate?.kind === "year" &&
      candidate?.value === 2021 &&
      typeof candidate?.span?.start === "number" &&
      typeof candidate?.span?.end === "number";

    check(
      "1-POINT-YEAR-CANDIDATE-EXISTS",
      '"hospital mortality rate in 2021": temporalCandidates contains {kind:"year", value:2021}, span preserved',
      pass,
      JSON.stringify({ temporalCandidates: semanticResult.temporalCandidates }),
    );
  }

  // 2 - "during 2021" is recognized identically to "in 2021" - same
  // token-shape mechanism, no phrase-specific special-casing.
  {
    const semanticResult = semantic.resolve("hospital mortality rate during 2021");

    const candidate = semanticResult.temporalCandidates?.[0];

    const pass =
      semanticResult.temporalCandidates !== undefined &&
      semanticResult.temporalCandidates.length === 1 &&
      candidate?.kind === "year" &&
      candidate?.value === 2021;

    check(
      "2-DURING-YEAR-RECOGNIZED",
      '"hospital mortality rate during 2021": same point-year representation as "in 2021"',
      pass,
      JSON.stringify({ temporalCandidates: semanticResult.temporalCandidates }),
    );
  }

  // 3 - HARD REGRESSION: "by year" must remain a dimension-typed
  // candidate in `matches`, unchanged, with NO temporal literal
  // candidate - and the existing capability-unavailable refusal must
  // remain byte-for-byte identical (RCG-008 + Phase 8.5, untouched).
  {
    const semanticResult = semantic.resolve("best hospitals by year");

    const hasDimensionCandidate = semanticResult.matches.some(
      (m) => m.semanticType === "dimension" && m.canonicalKey === "year-dimension",
    );

    const flag = { called: false };
    const engine = makeEngine(flag);
    const result = await engine.execute({
      question: "best hospitals by year",
      parameters: {},
    });

    const pass =
      hasDimensionCandidate &&
      semanticResult.temporalCandidates === undefined &&
      result.success === false &&
      result.answerability?.status === "not_directly_answerable" &&
      result.answerability?.reason === "capability-unavailable" &&
      !flag.called;

    check(
      "3-BY-YEAR-DIMENSION-REGRESSION",
      '"best hospitals by year": year-dimension unchanged in matches, NO temporal candidate, still honestly capability-unavailable',
      pass,
      JSON.stringify({ hasDimensionCandidate, temporalCandidates: semanticResult.temporalCandidates, result, sqlCalled: flag.called }),
    );
  }

  // 4 - Regression: ordinary non-temporal query unaffected.
  {
    const flag = { called: false };
    const engine = makeEngine(flag);
    const result = await engine.execute({
      question: "best hospitals for mortality",
      parameters: {},
    });

    const pass = result.success === true && flag.called;

    check(
      "4-ORDINARY-QUERY-REGRESSION",
      '"best hospitals for mortality": unaffected by Phase 8.6A',
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 5 - Regression: a genuinely supported, already-working query is
  // unaffected.
  {
    const flag = { called: false };
    const engine = makeEngine(flag);
    const result = await engine.execute({
      question: "hospital count in California",
      parameters: {},
    });

    const pass = result.success === true && flag.called;

    check(
      "5-SUPPORTED-QUERY-REGRESSION",
      '"hospital count in California": unaffected by Phase 8.6A',
      pass,
      JSON.stringify({ result, sqlCalled: flag.called }),
    );
  }

  // 6 - OUT OF SCOPE, SAFELY: a range expression must not be
  // misinterpreted as a single point-year filter. Both boundary years
  // may each independently surface as their own point-year candidate
  // (honest, unconnected literals) - what must NOT happen is the
  // implementation inventing any combined "range" meaning.
  {
    const semanticResult = semantic.resolve("hospital mortality between 2021 and 2023");

    const kinds = (semanticResult.temporalCandidates ?? []).map((c) => c.kind);
    const noInventedRangeKind = kinds.every((k) => k === "year");

    check(
      "6-RANGE-NOT-MISINTERPRETED",
      '"hospital mortality between 2021 and 2023": no invented range/relationship meaning - only plain, independent year literals (if any), never a "range" kind',
      noInventedRangeKind,
      JSON.stringify({ temporalCandidates: semanticResult.temporalCandidates }),
    );
  }

  // 7 - OUT OF SCOPE, SAFELY: "last year" must not invent a temporal
  // value - no year literal exists in the text at all, so nothing
  // should be produced.
  {
    const semanticResult = semantic.resolve("hospital mortality last year");

    const pass = semanticResult.temporalCandidates === undefined;

    check(
      "7-LAST-YEAR-NOT-INVENTED",
      '"hospital mortality last year": no temporal candidate invented - no literal year token exists in the text',
      pass,
      JSON.stringify({ temporalCandidates: semanticResult.temporalCandidates }),
    );
  }

  // 8 - OUT OF SCOPE, SAFELY: "before 2021" - the literal "2021" token
  // is recognized as a plain point-year candidate (the same honest,
  // context-free recognition as every other case), but 8.6A does not,
  // and must not, attach any "before"/relational meaning to it - there
  // is no `operator`/relation field on TemporalCandidate at all.
  {
    const semanticResult = semantic.resolve("hospital mortality before 2021");

    const candidate = semanticResult.temporalCandidates?.[0];

    const pass =
      semanticResult.temporalCandidates !== undefined &&
      semanticResult.temporalCandidates.length === 1 &&
      candidate?.kind === "year" &&
      candidate?.value === 2021 &&
      !("operator" in (candidate ?? {})) &&
      !("relation" in (candidate ?? {}));

    check(
      "8-BEFORE-YEAR-NO-RELATION-INVENTED",
      '"hospital mortality before 2021": "2021" recognized as a plain point-year literal only - no relational/operator meaning invented',
      pass,
      JSON.stringify({ temporalCandidates: semanticResult.temporalCandidates }),
    );
  }

  console.log("=".repeat(80));
  console.log("PHASE 8.6A - TEMPORAL SEMANTIC FOUNDATION VERIFICATION");
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
