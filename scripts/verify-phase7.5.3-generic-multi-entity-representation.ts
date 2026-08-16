/**
 * Phase 7.5.3 - Generic Multi-Entity Representation Verification
 *
 * Proves, using domain-neutral fixtures only (no hospital names, no
 * facility IDs), that the Universal query-planner layer can now carry
 * multiple independently resolved entities of the same type through
 * QueryPlan.parameters and ExecutionPlan.filters without one silently
 * overwriting another - while leaving single-entity behavior byte-for-
 * byte unchanged.
 *
 * Exercises the REAL EntityParameterResolver, ExecutionPlanMapper, and
 * EntityResolver classes directly with hand-built fixtures - this is a
 * Universal Core contract/logic test, not a Healthcare capability test.
 */

import type { SemanticCandidate } from "../packages/semantic/src/candidate/SemanticCandidate";
import type { EntityDefinition, EntityProvider, EntityResolutionResult } from "../packages/domain-sdk/src/index";
import { EntityParameterResolver } from "../packages/query-planner/src/entity-parameter-resolver";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { EntityResolver } from "../packages/semantic/src/entity/entity-resolver";
import type { SemanticCollections } from "../packages/query-planner/src/semantic-collections";
import type { QueryPlan } from "../packages/query-planner/src/query-plan";

const entityParameterResolver = new EntityParameterResolver();
const executionPlanMapper = new ExecutionPlanMapper();

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

// Domain-neutral entity definition - generic "entity" type, execution
// parameter also generically named "entity". Nothing Healthcare-specific.
const genericEntityDefinition: EntityDefinition = {
  id: "entity",
  name: "entity",
  displayName: "Entity",
  execution: { parameter: "entity" },
};

function entityCandidate(phrase: string, resolvedValue: string): SemanticCandidate {
  return {
    phrase,
    canonicalKey: "entity",
    semanticType: "entity",
    definition: genericEntityDefinition,
    confidence: 1,
    start: 0,
    end: 0,
    resolvedValue,
  };
}

function emptyCollections(entities: SemanticCandidate[]): SemanticCollections {
  return {
    metrics: [
      {
        phrase: "metric",
        canonicalKey: "metric",
        semanticType: "metric",
        definition: { id: "metric", name: "metric", displayName: "Metric" },
        confidence: 1,
        start: 0,
        end: 0,
      } as SemanticCandidate,
    ],
    entities,
    dimensions: [],
    categories: [],
    benchmarks: [],
    relationships: [],
  };
}

function planFor(entities: SemanticCandidate[]): QueryPlan {
  return {
    semantic: emptyCollections(entities),
    intent: "lookup",
    parameters: entityParameterResolver.resolve(emptyCollections(entities)),
    filters: [],
  };
}

// CASE 1 - TWO DISTINCT ENTITIES: both survive independently, under the
// same generic execution parameter.
{
  const entities = [entityCandidate("entity a", "A"), entityCandidate("entity b", "B")];
  const parameters = entityParameterResolver.resolve(emptyCollections(entities));
  const executionPlan = executionPlanMapper.map(planFor(entities));

  const pass =
    Array.isArray(parameters.entity) &&
    (parameters.entity as unknown[]).length === 2 &&
    (parameters.entity as unknown[])[0] === "A" &&
    (parameters.entity as unknown[])[1] === "B" &&
    executionPlan.filters.length === 1 &&
    executionPlan.filters[0]!.field === "entity" &&
    executionPlan.filters[0]!.operator === "in" &&
    JSON.stringify(executionPlan.filters[0]!.value) === JSON.stringify(["A", "B"]);

  check(
    "CASE 1 - TWO DISTINCT ENTITIES",
    "Entity A and Entity B both survive independently, in order, as a single grouped filter",
    pass,
    `parameters=${JSON.stringify(parameters)}, filters=${JSON.stringify(executionPlan.filters)}`,
  );
}

// CASE 2 - THREE DISTINCT ENTITIES: all three survive, in order.
{
  const entities = [
    entityCandidate("entity a", "A"),
    entityCandidate("entity b", "B"),
    entityCandidate("entity c", "C"),
  ];
  const parameters = entityParameterResolver.resolve(emptyCollections(entities));
  const executionPlan = executionPlanMapper.map(planFor(entities));

  const pass =
    Array.isArray(parameters.entity) &&
    JSON.stringify(parameters.entity) === JSON.stringify(["A", "B", "C"]) &&
    executionPlan.filters.length === 1 &&
    JSON.stringify(executionPlan.filters[0]!.value) === JSON.stringify(["A", "B", "C"]);

  check(
    "CASE 2 - THREE DISTINCT ENTITIES",
    "Entity A, B, and C all survive independently, in the original order",
    pass,
    `parameters=${JSON.stringify(parameters)}, filters=${JSON.stringify(executionPlan.filters)}`,
  );
}

// CASE 3 - SAME DISPLAY NAME, DIFFERENT CANONICAL IDs: two entities that
// share the exact same phrase text but resolve to different canonical
// values must both be preserved - deduplication is by resolved value,
// never by display name/phrase.
{
  const entities = [
    entityCandidate("example entity", "A"),
    entityCandidate("example entity", "B"),
  ];
  const parameters = entityParameterResolver.resolve(emptyCollections(entities));
  const executionPlan = executionPlanMapper.map(planFor(entities));

  const pass =
    Array.isArray(parameters.entity) &&
    JSON.stringify(parameters.entity) === JSON.stringify(["A", "B"]) &&
    JSON.stringify(executionPlan.filters[0]!.value) === JSON.stringify(["A", "B"]);

  check(
    "CASE 3 - SAME DISPLAY NAME, DIFFERENT IDs",
    'Two entities both phrased "example entity" but resolving to A and B are NOT collapsed into one',
    pass,
    `parameters=${JSON.stringify(parameters)}, filters=${JSON.stringify(executionPlan.filters)}`,
  );
}

// CASE 3b - the reverse: the SAME canonical value seen twice (e.g. the
// same entity mentioned twice in one query) must be deduplicated down to
// one entry, not produce a redundant [A, A].
{
  const entities = [entityCandidate("entity a", "A"), entityCandidate("entity a again", "A")];
  const parameters = entityParameterResolver.resolve(emptyCollections(entities));

  const pass = parameters.entity === "A"; // exactly one distinct value -> scalar, not ["A","A"]

  check(
    "CASE 3b - IDENTICAL CANONICAL ID DEDUPLICATED",
    "The same canonical ID mentioned twice collapses to one entry, not a redundant duplicate",
    pass,
    `parameters=${JSON.stringify(parameters)}`,
  );
}

// CASE 4 - AMBIGUOUS ENTITY: an ambiguous resolution must never be
// silently turned into a fake single entity.
{
  // 4a: the resolution layer itself (EntityResolver, a one-line
  // delegate to the domain's EntityProvider) must report ambiguity
  // honestly, not a fabricated value.
  const ambiguousProvider: EntityProvider = {
    resolve(phrase: string): EntityResolutionResult {
      if (phrase === "example entity") {
        return {
          found: false,
          entityId: "entity",
          value: null,
          phrase,
          status: "ambiguous",
          candidates: ["A", "B"],
        };
      }
      return { found: false, entityId: null, value: null, phrase: null, status: "not_found" };
    },
  };

  const resolver = new EntityResolver(ambiguousProvider);
  const resolution = resolver.resolve("example entity");

  const resolutionPass =
    resolution.found === false &&
    resolution.status === "ambiguous" &&
    Array.isArray(resolution.candidates) &&
    resolution.candidates.length === 2 &&
    resolution.value === null;

  // 4b: because `found` is false, the existing (unmodified) semantic
  // pipeline never builds a SemanticCandidate for this phrase at all -
  // meaning an ambiguous entity never reaches the entities array this
  // task's functions operate on. Confirm directly: when the entities
  // array correctly contains none (as it would for a real ambiguous
  // mention), the functions produce nothing - never an arbitrarily
  // chosen identity.
  const emptyParameters = entityParameterResolver.resolve(emptyCollections([]));
  const emptyExecutionPlan = executionPlanMapper.map(planFor([]));

  const noFabricationPass =
    emptyParameters.entity === undefined &&
    emptyExecutionPlan.filters.length === 0;

  const pass = resolutionPass && noFabricationPass;

  check(
    "CASE 4 - AMBIGUOUS ENTITY",
    "Ambiguity is reported honestly (candidates=[A,B], not a chosen value); and since an ambiguous match never becomes a SemanticCandidate in the unmodified pipeline, these functions never fabricate an identity from an empty entity set",
    pass,
    `resolution=${JSON.stringify(resolution)}, emptyParameters=${JSON.stringify(emptyParameters)}, emptyFilters=${JSON.stringify(emptyExecutionPlan.filters)}`,
  );
}

// CASE 5 - EXISTING SINGLE ENTITY REGRESSION: exactly one entity must
// continue to produce a plain scalar value and a plain "=" filter,
// exactly as before this change.
{
  const entities = [entityCandidate("entity a", "A")];
  const parameters = entityParameterResolver.resolve(emptyCollections(entities));
  const executionPlan = executionPlanMapper.map(planFor(entities));

  const pass =
    parameters.entity === "A" &&
    !Array.isArray(parameters.entity) &&
    executionPlan.filters.length === 1 &&
    executionPlan.filters[0]!.operator === "=" &&
    executionPlan.filters[0]!.value === "A";

  check(
    "CASE 5 - SINGLE ENTITY REGRESSION",
    "A single resolved entity still produces a plain scalar parameter and a plain \"=\" filter, unchanged",
    pass,
    `parameters=${JSON.stringify(parameters)}, filters=${JSON.stringify(executionPlan.filters)}`,
  );
}

console.log("\n" + "=".repeat(80));
console.log("PHASE 7.5.3 GENERIC MULTI-ENTITY REPRESENTATION VERIFICATION");
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
  console.log("\n❌ PHASE 7.5.3 GENERIC MULTI-ENTITY REPRESENTATION VERIFICATION: FAILED");
  process.exit(1);
} else {
  console.log("\n✅ PHASE 7.5.3 GENERIC MULTI-ENTITY REPRESENTATION VERIFICATION: ALL TESTS PASSED");
}
