/**
 * Tier0 Task 5: F12 Real Fix V2 — Sub-Task A (List Intent) + Sub-Task B
 * (B-full Condition-Specific Ranking) Verification Suite.
 *
 * Sub-Task A: a bare scope filter (e.g. ownership) with no metric named
 * defaults to the active Domain SDK's own declared default ranking
 * metric (MetricDefinition.defaultRankable), via a new, small, generic
 * QueryPlanner.discoverDefaultRankableMetric() - mirroring the existing
 * discoverComparableMetrics() pattern. Deliberately excludes any query
 * naming an entity that identifies a single, specific record
 * (EntityDefinition.identifiesUniqueRecord) to avoid reintroducing the
 * F8 entity-drop shape for a named-hospital bare query.
 *
 * Sub-Task B (B-full): a resolved "concept" candidate (e.g. AMI) whose
 * ConceptDefinition declares a `measureCodesByMetric` map is now
 * consumed by ExecutionPlanMapper.buildFilters() into a `measureCode`
 * filter, routed by HealthcareExecutionStrategy.selectTemplateFromPlan()
 * to 2 new SQL templates joining the per-condition detail tables
 * (warehouse_hospital_clinical_outcomes / _readmissions). Scoped to
 * "rank" operations only - a lookup-shaped query (single named
 * hospital, no ranking word) keeps using the existing single-hospital
 * lookup templates (also extended with an optional :measureCode
 * parameter, so "Mayo Clinic's AMI mortality" narrows to exactly one
 * row instead of returning every measure code undifferentiated).
 *
 * Run: npx tsx scripts/verify-prephase9-task5-f12-real-fix-b-full.ts
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

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
const planner = new QueryPlanner();
const mapper = new ExecutionPlanMapper();
const client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
const adapter = new SupabaseDatabaseAdapter(client);
const executor = new SqlExecutor(adapter);

interface TestResult { id: string; passed: boolean; detail: string; }
const results: TestResult[] = [];
function record(id: string, passed: boolean, detail: string) {
  results.push({ id, passed, detail });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${id} - ${detail}`);
}

function countingEngine() {
  let calls = 0;
  const spyExecutor = {
    execute: async (...args: Parameters<typeof executor.execute>) => {
      calls++;
      return executor.execute(...args);
    },
  };
  const spyEngine = createRuntimeEngine({
    runtime, semantic, planner, executionPlanMapper: mapper,
    executor: spyExecutor as unknown as typeof executor,
  });
  return { spyEngine, getCalls: () => calls };
}

async function check(id: string, question: string, assert: (r: any, calls: number) => boolean) {
  const { spyEngine, getCalls } = countingEngine();
  const result = await spyEngine.execute({ question });
  const rows = (result.rows ?? []) as any[];
  const pass = assert(result, getCalls());
  record(
    id,
    pass,
    `success=${result.success} answerability=${JSON.stringify(result.answerability?.status)}/${JSON.stringify(result.answerability?.reason)} rowCount=${result.rowCount} sqlCalls=${getCalls()} error=${JSON.stringify(result.error)} measure_codes=${JSON.stringify([...new Set(rows.map((r) => r.measure_code))])} ownership=${JSON.stringify([...new Set(rows.map((r) => r.ownership))])} facility_ids=[${rows.map((r) => r.facility_id).join(",")}]`,
  );
}

async function main() {
  console.log("=".repeat(90));
  console.log("TIER0 TASK 5: F12 REAL FIX V2 (LIST INTENT + B-FULL CONDITION RANKING)");
  console.log("=".repeat(90));

  // --- Group 1: Sub-Task A - bare ownership list intent ---
  await check(
    "G1-1-NONPROFIT-BARE-DIRECT-ANSWER",
    "Show me non-profit hospitals",
    (r, calls) => r.success === true && calls > 0 && (r.rows ?? []).every((row: any) => String(row.ownership ?? "").startsWith("Voluntary non-profit")),
  );
  await check(
    "G1-2-GOVERNMENT-BARE-DIRECT-ANSWER",
    "Show me government hospitals",
    (r, calls) => r.success === true && calls > 0 && (r.rows ?? []).every((row: any) => String(row.ownership ?? "").startsWith("Government")),
  );

  // --- Group 2: Sub-Task B (B-full) - the 6 primary condition queries ---
  await check(
    "G2-1-AMI-MORTALITY",
    "Show me hospitals with best AMI mortality",
    (r, calls) => r.success === true && calls > 0 && (r.rows ?? []).every((row: any) => row.measure_code === "MORT_30_AMI"),
  );
  await check(
    "G2-2-CABG-READMISSION",
    "Hospitals with lowest CABG readmission",
    (r, calls) => r.success === true && calls > 0 && (r.rows ?? []).every((row: any) => row.measure_code === "READM-30-CABG-HRRP"),
  );
  await check(
    "G2-3-COPD-READMISSION",
    "Best hospitals for COPD readmission",
    (r, calls) => r.success === true && calls > 0 && (r.rows ?? []).every((row: any) => row.measure_code === "READM-30-COPD-HRRP"),
  );
  await check(
    "G2-4-HIPKNEE-READMISSION",
    "Hospitals with best Hip/Knee readmission",
    (r, calls) => r.success === true && calls > 0 && (r.rows ?? []).every((row: any) => row.measure_code === "READM-30-HIP-KNEE-HRRP"),
  );
  await check(
    "G2-5-HEARTFAILURE-MORTALITY",
    "Show me hospitals with lowest heart failure mortality",
    (r, calls) => r.success === true && calls > 0 && (r.rows ?? []).every((row: any) => row.measure_code === "MORT_30_HF"),
  );
  await check(
    "G2-6-PNEUMONIA-READMISSION",
    "Hospitals with best pneumonia readmission",
    (r, calls) => r.success === true && calls > 0 && (r.rows ?? []).every((row: any) => row.measure_code === "READM-30-PN-HRRP"),
  );

  // --- Group 3: condition synonyms ---
  await check(
    "G3-1-HEART-ATTACK-SYNONYM-FOR-AMI",
    "Show me hospitals with best heart attack mortality",
    (r, calls) => r.success === true && calls > 0 && (r.rows ?? []).every((row: any) => row.measure_code === "MORT_30_AMI"),
  );
  await check(
    "G3-2-HF-SYNONYM-FOR-HEART-FAILURE",
    "Hospitals with best HF readmission",
    (r, calls) => r.success === true && calls > 0 && (r.rows ?? []).every((row: any) => row.measure_code === "READM-30-HF-HRRP"),
  );
  await check(
    "G3-3-PN-SYNONYM-FOR-PNEUMONIA",
    "Hospitals with best PN readmission",
    (r, calls) => r.success === true && calls > 0 && (r.rows ?? []).every((row: any) => row.measure_code === "READM-30-PN-HRRP"),
  );

  // --- Group 4: controls (Framing 1 / Task 4, unaffected) ---
  await check("G4-1-LOWEST-MORTALITY-CONTROL", "hospitals with lowest mortality", (r) => r.success === true);
  await check("G4-2-LOWEST-READMISSION-CONTROL", "hospitals with lowest readmission", (r) => r.success === true);
  await check("G4-3-TEXAS-LOWEST-MORTALITY-CONTROL", "Texas hospitals with lowest mortality", (r) => r.success === true);
  await check(
    "G4-4-NATIONAL-MORTALITY-AVERAGE-CONTROL",
    "California hospitals performing above national mortality average",
    (r, calls) => r.success === true && calls > 0,
  );

  // --- Group 5: Task 1-3 preservation ---
  await check(
    "G5-1-MAYO-ROCHESTER",
    "Mayo Clinic Rochester Minnesota overall rating",
    (r) => r.success === true && r.rowCount === 1 && r.rows?.[0]?.facility_id === "240010",
  );
  await check(
    "G5-2-MEMORIAL-HOSPITAL-TEXAS",
    "Memorial Hospital Texas",
    (r, calls) => r.success === false && r.answerability?.status === "ambiguous" && calls === 0,
  );
  await check(
    "G5-3-BIRMINGHAM-9-ROWS",
    "Show me hospitals in Birmingham, Alabama with their overall ratings",
    (r) => r.success === true && r.rowCount === 9,
  );
  await check(
    "G5-4-ALBANY-COUNTY-QUALIFIED",
    "Show me the highest-rated hospitals in New York for ALBANY county",
    (r) => r.success === true && r.rowCount === 3,
  );

  // --- Group 6: combined ownership + condition + state ---
  await check(
    "G6-1-NONPROFIT-PLUS-AMI-MORTALITY",
    "Show me non-profit hospitals with best AMI mortality",
    (r, calls) =>
      r.success === true && calls > 0 &&
      (r.rows ?? []).every((row: any) => row.measure_code === "MORT_30_AMI" && String(row.ownership ?? "").startsWith("Voluntary non-profit")),
  );
  await check(
    "G6-2-TEXAS-PLUS-CABG-READMISSION",
    "Texas hospitals with lowest CABG readmission",
    (r, calls) =>
      r.success === true && calls > 0 &&
      (r.rows ?? []).every((row: any) => row.measure_code === "READM-30-CABG-HRRP" && row.state === "TX"),
  );

  // --- Group 7: named-hospital edge cases (must not regress into F8 entity-drop) ---
  await check(
    "G7-1-NAMED-HOSPITAL-CONDITION-LOOKUP-SCOPED",
    "What is Mayo Clinic's mortality rate for heart attack specifically?",
    (r) => r.success === true && r.rowCount === 1 && r.rows?.[0]?.measure_code === "MORT_30_AMI" && r.rows?.[0]?.facility_id === "100151",
  );
  await check(
    "G7-2-NAMED-HOSPITAL-CONDITION-RANKING-STILL-AMBIGUOUS",
    "Mayo Clinic best AMI mortality",
    (r, calls) => r.success === false && r.answerability?.status === "ambiguous" && calls === 0,
  );
  await check(
    "G7-3-COMPARISON-UNAFFECTED",
    "Compare Mayo Clinic and Cleveland Clinic",
    (r, calls) => r.success === true && calls > 0,
  );

  console.log("=".repeat(90));
  const passCount = results.filter((r) => r.passed).length;
  console.log(`SUMMARY: Total: ${results.length}  PASS: ${passCount}  FAIL: ${results.length - passCount}`);

  if (passCount !== results.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
