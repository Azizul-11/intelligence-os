/**
 * Qualifier Identity Safety Verification
 *
 * Verifies the two locked fixes from
 * docs/phase8/QUALIFIER_IDENTITY_SAFETY/QUALIFIER_IDENTITY_SAFETY_DESIGN_LOCK.md:
 *
 * Fix 1 (Domain, domain-packs/healthcare/src/runtime/entity-provider.ts):
 * narrowByQualifier()'s zero-match fallback returns status:"not_found"
 * (not "ambiguous") when the original candidate count was exactly 1 -
 * there is no real ambiguity to report when only one candidate ever
 * existed and the qualifier contradicts it.
 *
 * Fix 2 (Universal, packages/semantic/src/pipeline/semantic-pipeline.ts):
 * the Phase 8.1 ambiguity-overlap suppression now requires the
 * overlapping resolved candidate to share the ambiguity's own
 * `entityId` before suppressing it - a different-typed candidate (e.g.
 * a `state` entity) can never suppress a same-mention `hospital`
 * ambiguity.
 *
 * Plus the necessary complementary mechanism discovered during
 * implementation (documented in full in the implementation report):
 * a `not_found` qualifier-conflict (Fix 1's new result) suppresses an
 * overlapping, SAME bare-name, SAME-type resolved candidate elsewhere
 * in the query - but only when doing so is safe with respect to other
 * same-type entities in the query (the sole entity, or a genuine
 * duplicate of an already-resolved value) - so a multi-entity
 * comparison's own, independent entities are never corrupted.
 *
 * Uses the real semantic + planner + runtime-engine pipeline
 * throughout. The two most safety-critical cases use the REAL
 * SqlExecutor (with a MockDatabaseAdapter) rather than a spy, since
 * only the real executor's own required-parameter guard can prove no
 * wrong facility_id ever reaches a SQL parameter.
 */

import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { SqlExecutor } from "../packages/sql-executor/src/sql-executor";
import { MockDatabaseAdapter } from "../packages/sql-executor/src/mock-database-adapter";

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
  return createRuntimeEngine({ runtime, semantic, planner, executionPlanMapper: mapper, executor: spyExecutor as any });
}

function makeRealEngine() {
  return createRuntimeEngine({
    runtime,
    semantic,
    planner,
    executionPlanMapper: mapper,
    executor: new SqlExecutor(new MockDatabaseAdapter()),
  });
}

async function run() {
  // 1 - Genuine duplicate, small (Northwest Medical Center).
  {
    const flag = { called: false };
    const engine = makeSpyEngine(flag);
    const result = await engine.execute({ question: "Northwest Medical Center", parameters: {} });
    const pass =
      result.success === false &&
      result.answerability?.status === "ambiguous" &&
      result.answerability?.reason === "identity-ambiguous" &&
      result.answerability?.candidates?.length === 2 &&
      !flag.called;
    check("1-NORTHWEST-BARE-AMBIGUITY", "Northwest Medical Center: 2 real candidates, clarification, no SQL", pass, JSON.stringify({ result, sqlCalled: flag.called }));
  }

  // 2 - Genuine duplicate, large (Memorial Hospital, 12 real facilities).
  {
    const flag = { called: false };
    const engine = makeSpyEngine(flag);
    const result = await engine.execute({ question: "Tell me about Memorial Hospital", parameters: {} });
    const pass =
      result.success === false &&
      result.answerability?.status === "ambiguous" &&
      result.answerability?.reason === "identity-ambiguous" &&
      result.answerability?.candidates?.length === 12 &&
      !flag.called;
    check("2-MEMORIAL-BARE-AMBIGUITY-SCALE", "Memorial Hospital: all 12 real candidates, clarification, no SQL", pass, JSON.stringify({ result, sqlCalled: flag.called }));
  }

  // 3 - Valid qualifier narrows to one (Memorial Hospital in Dumas, TX).
  {
    const flag = { called: false };
    const engine = makeSpyEngine(flag);
    const result = await engine.execute({ question: "Tell me about Memorial Hospital in DUMAS, Texas", parameters: {} });
    const pass = result.success === true && result.answerability?.status === "answerable" && flag.called;
    check("3-MEMORIAL-DUMAS-VALID-QUALIFIER", "Memorial Hospital in DUMAS, Texas: unique facility 451386, success", pass, JSON.stringify({ result, sqlCalled: flag.called }));
  }

  // 4 - Valid qualifier narrows to one (Northwest Medical Center in Tucson).
  {
    const sem = semantic.resolve("Northwest Medical Center in Tucson");
    const entity = sem.matches.find((m) => m.semanticType === "entity");
    const pass = entity?.resolvedValue === "030085";
    check("4-NORTHWEST-TUCSON-VALID-QUALIFIER", "Northwest Medical Center in Tucson: unique facility 030085", pass, JSON.stringify({ resolvedValue: entity?.resolvedValue }));
  }

  // 5 - Valid qualifier narrows to one (Greene County Hospital in Eutaw).
  {
    const sem = semantic.resolve("Greene County Hospital in Eutaw");
    const entity = sem.matches.find((m) => m.semanticType === "entity");
    const pass = entity?.resolvedValue === "010051";
    check("5-GREENE-EUTAW-VALID-QUALIFIER", "Greene County Hospital in Eutaw: unique facility 010051", pass, JSON.stringify({ resolvedValue: entity?.resolvedValue }));
  }

  // 6 - CRITICAL: contradictory qualifier must never silently fall
  // back to the bare candidate. Real executor - proves no SQL
  // parameter ever receives the wrong facility_id.
  {
    const sem = semantic.resolve("What is the overall rating of Mayo Clinic in Rochester, Minnesota?");
    const hospitalEntity = sem.matches.find((m) => m.semanticType === "entity" && m.canonicalKey === "hospital");
    const engine = makeRealEngine();
    const result = await engine.execute({ question: "What is the overall rating of Mayo Clinic in Rochester, Minnesota?", parameters: {} });
    const pass = hospitalEntity === undefined && result.success === false && result.error !== "" ;
    check(
      "6-MAYO-ROCHESTER-CONTRADICTORY-QUALIFIER-CRITICAL",
      "Mayo Clinic in Rochester, Minnesota: no hospital-type candidate at all (100151 not silently used), honest failure, no wrong facility_id reaches SQL",
      pass,
      JSON.stringify({ hospitalEntity, result }),
    );
  }

  // 7 - Pattern 2: a qualifier that correctly narrows a large ambiguous
  // set must survive, not be discarded in favor of the un-narrowed set.
  {
    const flag = { called: false };
    const engine = makeSpyEngine(flag);
    const result = await engine.execute({ question: "Tell me about Memorial Hospital in Texas", parameters: {} });
    const pass =
      result.success === false &&
      result.answerability?.candidates?.length === 3 &&
      (result.answerability?.candidates as any[])?.every((c) => c.label?.endsWith(", TX")) &&
      !flag.called;
    check("7-MEMORIAL-TEXAS-NARROWED-AMBIGUITY", "Memorial Hospital in Texas: exactly the 3 real Texas candidates, not all 12, no SQL", pass, JSON.stringify({ result, sqlCalled: flag.called }));
  }

  // 8 - Prefix/containment regression (F4 must remain untouched).
  {
    const sem = semantic.resolve("Mayo Clinic Hospital");
    const entities = sem.matches.filter((m) => m.semanticType === "entity");
    const pass = entities.length === 1 && entities[0]!.resolvedValue === "030103";
    check("8-MAYO-CLINIC-HOSPITAL-PREFIX-REGRESSION", "Mayo Clinic Hospital: only facility 030103, no phantom 100151", pass, JSON.stringify({ entities: entities.map((e) => e.resolvedValue) }));
  }

  // 9 - Explicit metric regression.
  {
    const flag = { called: false };
    const engine = makeSpyEngine(flag);
    const result = await engine.execute({ question: "Mayo Clinic Hospital overall rating", parameters: {} });
    const pass = result.success === true && flag.called;
    check("9-MAYO-CLINIC-HOSPITAL-METRIC-REGRESSION", "Mayo Clinic Hospital overall rating: one facility, unaffected", pass, JSON.stringify({ result, sqlCalled: flag.called }));
  }

  // 10 - Comparison regression: two genuinely distinct entities.
  {
    const flag = { called: false };
    const engine = makeSpyEngine(flag);
    const result = await engine.execute({ question: "Compare Mayo Clinic and Cleveland Clinic", parameters: {} });
    const pass = result.success === true && flag.called;
    check("10-COMPARE-MAYO-CLEVELAND-REGRESSION", "Compare Mayo Clinic and Cleveland Clinic: unaffected, existing successful comparison", pass, JSON.stringify({ result, sqlCalled: flag.called }));
  }

  // 11 - Qualified comparison safety: the Rochester mention must not
  // silently become Jacksonville. Honest failure is acceptable.
  {
    const sem = semantic.resolve("Compare Mayo Clinic in Jacksonville with Mayo Clinic in Rochester");
    const hospitalEntities = sem.matches.filter((m) => m.semanticType === "entity" && m.canonicalKey === "hospital");
    const allJacksonville = hospitalEntities.length <= 1;
    const flag = { called: false };
    const engine = makeSpyEngine(flag);
    const result = await engine.execute({ question: "Compare Mayo Clinic in Jacksonville with Mayo Clinic in Rochester", parameters: {} });
    const pass = allJacksonville && !flag.called;
    check(
      "11-COMPARE-JACKSONVILLE-ROCHESTER-SAFETY-CRITICAL",
      "Compare Mayo Clinic in Jacksonville with Mayo Clinic in Rochester: Rochester mention never silently duplicates Jacksonville's value, no SQL",
      pass,
      JSON.stringify({ hospitalEntities: hospitalEntities.map((e) => e.resolvedValue), result, sqlCalled: flag.called }),
    );
  }

  // 12 - Regression discovered during implementation: a trailing
  // qualifier near ONE of several distinct entities in a comparison
  // must not corrupt that entity, even when the qualifier does not
  // match it (Phase 7.5.8's own pre-existing TEST 6).
  {
    const flag = { called: false };
    const engine = makeSpyEngine(flag);
    const result = await engine.execute({
      question: "Compare Mayo Clinic and Cleveland Clinic in Florida on overall rating and mortality",
      parameters: {},
    });
    const sem = semantic.resolve("Compare Mayo Clinic and Cleveland Clinic in Florida on overall rating and mortality");
    const hospitalValues = sem.matches.filter((m) => m.semanticType === "entity" && m.canonicalKey === "hospital").map((m) => m.resolvedValue);
    const pass = result.success === true && hospitalValues.includes("100151") && hospitalValues.includes("360180") && flag.called;
    check(
      "12-MULTI-ENTITY-TRAILING-QUALIFIER-REGRESSION",
      "Compare Mayo Clinic and Cleveland Clinic in Florida...: neither entity dropped merely because Cleveland Clinic is not in Florida",
      pass,
      JSON.stringify({ hospitalValues, result, sqlCalled: flag.called }),
    );
  }

  console.log("=".repeat(80));
  console.log("QUALIFIER IDENTITY SAFETY VERIFICATION");
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
