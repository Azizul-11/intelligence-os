/**
 * Phase 7.5.4 - Explicit Entity Execution Capability Verification
 *
 * Proves that the multi-entity representation Phase 7.5.3 established at
 * the Universal query-planner layer (entity -> scalar | array, filter
 * operator "=" | "in") now survives, unmodified in content, all the way
 * through HealthcareExecutionStrategy.resolveParametersFromPlan() into a
 * parameters object shaped for deterministic Healthcare SQL execution -
 * without collapsing, overwriting, or silently truncating any identity.
 *
 * This is an execution-CAPABILITY proof (parameter construction), not an
 * end-to-end two/three-entity runtime comparison proof - that is Phase
 * 7.5.5's scope. No live database call is made here.
 *
 * Uses the REAL hospitalEntity/stateEntity definitions, the REAL
 * EntityParameterResolver and ExecutionPlanMapper (Phase 7.5.3), and the
 * REAL HealthcareExecutionStrategy - with synthetic facility-id-shaped
 * values (not real hospital names) standing in for already-resolved
 * identities, since identity resolution itself was already proven with
 * real CMS data in Phase 7.5.2.
 */

import type { SemanticCandidate } from "../packages/semantic/src/candidate/SemanticCandidate";
import type { SemanticCollections } from "../packages/query-planner/src/semantic-collections";
import type { QueryPlan } from "../packages/query-planner/src/query-plan";
import { EntityParameterResolver } from "../packages/query-planner/src/entity-parameter-resolver";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { hospitalEntity, stateEntity } from "../domain-packs/healthcare/src/entities";
import { HealthcareExecutionStrategy } from "../domain-packs/healthcare/src/runtime/execution-strategy";

const entityParameterResolver = new EntityParameterResolver();
const executionPlanMapper = new ExecutionPlanMapper();
const strategy = new HealthcareExecutionStrategy();

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

function hospitalCandidate(phrase: string, resolvedValue: string): SemanticCandidate {
  return {
    phrase,
    canonicalKey: "hospital",
    semanticType: "entity",
    definition: hospitalEntity,
    confidence: 1,
    start: 0,
    end: 0,
    resolvedValue,
  } as SemanticCandidate;
}

function stateCandidate(phrase: string, resolvedValue: string): SemanticCandidate {
  return {
    phrase,
    canonicalKey: "state",
    semanticType: "entity",
    definition: stateEntity,
    confidence: 1,
    start: 0,
    end: 0,
    resolvedValue,
  } as SemanticCandidate;
}

function collections(entities: SemanticCandidate[]): SemanticCollections {
  return {
    metrics: [
      {
        phrase: "overall rating",
        canonicalKey: "hospital-overall-rating",
        semanticType: "metric",
        definition: { id: "hospital-overall-rating", name: "hospital-overall-rating", displayName: "Overall Rating" },
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

function executionPlanFor(entities: SemanticCandidate[]) {
  const semantic = collections(entities);
  const plan: QueryPlan = {
    semantic,
    intent: "lookup",
    parameters: entityParameterResolver.resolve(semantic),
    filters: [],
  };
  return executionPlanMapper.map(plan);
}

// CASE 1 - SINGLE HOSPITAL: existing scalar behavior is unchanged, and
// now correctly reaches the SQL-facing "hospitalId" parameter name that
// hospital-overall-rating.ts actually declares.
{
  const executionPlan = executionPlanFor([hospitalCandidate("example hospital", "FACILITY_A")]);
  const parameters = strategy.resolveParametersFromPlan(executionPlan);

  const pass =
    executionPlan.filters.length === 1 &&
    executionPlan.filters[0]!.operator === "=" &&
    executionPlan.filters[0]!.value === "FACILITY_A" &&
    parameters.hospitalId === "FACILITY_A" &&
    !Array.isArray(parameters.hospitalId) &&
    parameters.facilityIds === undefined;

  check(
    "CASE 1 - SINGLE HOSPITAL SCALAR",
    'One resolved hospital produces "=" filter and a scalar "hospitalId" parameter, unchanged from pre-7.5.4 shape',
    pass,
    `filters=${JSON.stringify(executionPlan.filters)}, parameters=${JSON.stringify(parameters)}`,
  );
}

// CASE 2 - TWO EXPLICIT HOSPITALS: both identities survive, grouped, and
// reach the existing Phase 7 "facilityIds" array parameter name.
{
  const executionPlan = executionPlanFor([
    hospitalCandidate("hospital a", "FACILITY_A"),
    hospitalCandidate("hospital b", "FACILITY_B"),
  ]);
  const parameters = strategy.resolveParametersFromPlan(executionPlan);

  const pass =
    executionPlan.filters.length === 1 &&
    executionPlan.filters[0]!.operator === "in" &&
    JSON.stringify(executionPlan.filters[0]!.value) === JSON.stringify(["FACILITY_A", "FACILITY_B"]) &&
    Array.isArray(parameters.facilityIds) &&
    JSON.stringify(parameters.facilityIds) === JSON.stringify(["FACILITY_A", "FACILITY_B"]) &&
    parameters.hospitalId === undefined;

  check(
    "CASE 2 - TWO EXPLICIT HOSPITALS",
    'Both facility_ids survive as one "in" filter and land intact in the "facilityIds" array parameter - no last-write-wins',
    pass,
    `filters=${JSON.stringify(executionPlan.filters)}, parameters=${JSON.stringify(parameters)}`,
  );
}

// CASE 3 - THREE EXPLICIT HOSPITALS: N-ary, not a hidden two-entity
// special case.
{
  const executionPlan = executionPlanFor([
    hospitalCandidate("hospital a", "FACILITY_A"),
    hospitalCandidate("hospital b", "FACILITY_B"),
    hospitalCandidate("hospital c", "FACILITY_C"),
  ]);
  const parameters = strategy.resolveParametersFromPlan(executionPlan);

  const pass =
    Array.isArray(parameters.facilityIds) &&
    JSON.stringify(parameters.facilityIds) === JSON.stringify(["FACILITY_A", "FACILITY_B", "FACILITY_C"]);

  check(
    "CASE 3 - THREE EXPLICIT HOSPITALS",
    "All three facility_ids survive into a single facilityIds array parameter, in order",
    pass,
    `parameters=${JSON.stringify(parameters)}`,
  );
}

// CASE 4 - NO SILENT OVERWRITE BETWEEN executionPlan.filters AND
// executionPlan.parameters: both are populated (as they always are for
// entity-derived fields) and must agree - resolveParametersFromPlan must
// not let one silently clobber the other with a different value.
{
  const executionPlan = executionPlanFor([
    hospitalCandidate("hospital a", "FACILITY_A"),
    hospitalCandidate("hospital b", "FACILITY_B"),
  ]);

  const filterValue = executionPlan.filters.find((f) => f.field === "hospital")?.value;
  const parameterValue = executionPlan.parameters?.hospital;

  const inputsAgree = JSON.stringify(filterValue) === JSON.stringify(parameterValue);

  const parameters = strategy.resolveParametersFromPlan(executionPlan);

  const pass =
    inputsAgree &&
    JSON.stringify(parameters.facilityIds) === JSON.stringify(["FACILITY_A", "FACILITY_B"]);

  check(
    "CASE 4 - NO FILTERS/PARAMETERS OVERWRITE",
    "ExecutionPlan.filters and ExecutionPlan.parameters carry identical grouped values for the same entity field, and resolveParametersFromPlan preserves them rather than letting one silently overwrite the other with a truncated value",
    pass,
    `filterValue=${JSON.stringify(filterValue)}, parameterValue=${JSON.stringify(parameterValue)}, resolved=${JSON.stringify(parameters)}`,
  );
}

// CASE 5 - MIXED FIELDS REGRESSION: an unrelated entity field ("state")
// sharing the same request is untouched by the hospital-specific
// translation - only "hospital" is renamed, "state" keeps its existing
// name and shape exactly as Phase 7's live Texas regression already
// depends on.
{
  const executionPlan = executionPlanFor([
    hospitalCandidate("hospital a", "FACILITY_A"),
    stateCandidate("some state", "TX"),
  ]);
  const parameters = strategy.resolveParametersFromPlan(executionPlan);

  const pass =
    parameters.hospitalId === "FACILITY_A" &&
    parameters.state === "TX" &&
    parameters.stateId === undefined;

  check(
    "CASE 5 - UNRELATED FIELD (state) UNCHANGED",
    'The "state" parameter is untouched by the hospital-specific translation - only "hospital" is renamed',
    pass,
    `parameters=${JSON.stringify(parameters)}`,
  );
}

// CASE 6 - EXISTING PHASE 7 SECONDARY-METRIC IDENTITY-SET BEHAVIOR IS
// UNCHANGED: resolveSecondaryMetricParameters still produces the exact
// "facilityIds" shape it always has, independent of this task's changes.
{
  const identityValues = ["FACILITY_A", "FACILITY_B", "FACILITY_C"];
  const secondaryParameters = strategy.resolveSecondaryMetricParameters!(
    { metric: "readmission-rate", direction: "desc" },
    executionPlanFor([hospitalCandidate("hospital a", "FACILITY_A")]),
    identityValues,
  );

  const pass =
    Array.isArray(secondaryParameters.facilityIds) &&
    JSON.stringify(secondaryParameters.facilityIds) === JSON.stringify(identityValues);

  check(
    "CASE 6 - PHASE 7 SECONDARY METRIC IDENTITY-SET REGRESSION",
    "resolveSecondaryMetricParameters still produces an unchanged facilityIds array from the given identity values",
    pass,
    `secondaryParameters=${JSON.stringify(secondaryParameters)}`,
  );
}

console.log("\n" + "=".repeat(80));
console.log("PHASE 7.5.4 EXPLICIT ENTITY EXECUTION CAPABILITY VERIFICATION");
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
  console.log("\n❌ PHASE 7.5.4 EXPLICIT ENTITY EXECUTION CAPABILITY VERIFICATION: FAILED");
  process.exit(1);
} else {
  console.log("\n✅ PHASE 7.5.4 EXPLICIT ENTITY EXECUTION CAPABILITY VERIFICATION: ALL TESTS PASSED");
}
