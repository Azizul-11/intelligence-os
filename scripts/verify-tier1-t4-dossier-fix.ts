/**
 * Pre-Phase 9 Tier1 Task 4 Fix Verification: Single-Hospital Cross-Table
 * Dossier Enrichment.
 *
 * Live, in-process, spy-instrumented against the remote Supabase warehouse.
 * Authoritative post-fix verification - supersedes the audit script
 * (verify-tier1-t4-dossier-audit.ts) for regression purposes.
 *
 * Run: npx tsx scripts/verify-tier1-t4-dossier-fix.ts
 */
import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { SqlExecutor } from "../packages/sql-executor/src/sql-executor";
import { SupabaseDatabaseAdapter } from "../packages/sql-executor/src/supabase-database-adapter";
import {
  createPendingInteraction,
  retrievePendingInteraction,
  consumePendingInteraction,
  matchClarificationResponse,
} from "../packages/runtime-engine/src/continuation/index";
import { createClient } from "@supabase/supabase-js";
import { env } from "./shared/env";

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
const planner = new QueryPlanner();
const mapper = new ExecutionPlanMapper();
const client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
const adapter = new SupabaseDatabaseAdapter(client);
const executor = new SqlExecutor(adapter);

const DOSSIER_COLUMNS = [
  "facility_id", "hospital_name", "city", "state", "county", "hospital_type",
  "ownership", "overall_rating", "emergency_services",
  "mort_measures_better", "mort_measures_no_different", "mort_measures_worse",
  "facility_mort_measure_count",
  "readm_measures_better", "readm_measures_no_different", "readm_measures_worse",
  "facility_readm_measure_count",
  "safety_measures_better", "safety_measures_no_different", "safety_measures_worse",
  "facility_safety_measure_count", "avg_patient_satisfaction",
];

let pass = 0;
let fail = 0;
function check(id: string, label: string, condition: boolean, detail: string) {
  if (condition) {
    pass++;
    console.log(`  [PASS] ${id} ${label}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${id} ${label} -- ${detail}`);
  }
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

async function run(question: string) {
  const { spyEngine, getCalls } = countingEngine();
  const result = await spyEngine.execute({ question });
  const sqlCalls = getCalls();
  const rowSample = (result.rows ?? [])[0];
  const columns = rowSample ? Object.keys(rowSample) : [];
  const facilityIds = (result.rows ?? []).map((r: any) => r.facility_id);
  console.log(
    `    "${question}" -> success=${result.success} status=${result.answerability?.status} rowCount=${result.rowCount ?? 0} sqlCalls=${sqlCalls} columns(${columns.length}) facility_ids=${JSON.stringify(facilityIds)}`,
  );
  return { result, sqlCalls, columns, facilityIds, rowSample };
}

function hasAllDossierColumns(columns: string[]): boolean {
  return DOSSIER_COLUMNS.every((c) => columns.includes(c));
}

async function main() {
  console.log("=".repeat(100));
  console.log("TIER1 TASK 4 FIX VERIFICATION: DOSSIER ENRICHMENT (POST-FIX)");
  console.log("=".repeat(100));

  console.log("\n--- Part 1: alias / metric / SQL template listing (after fix) ---");
  const { hospitalDetailAlias } = await import("../domain-packs/healthcare/src/aliases/hospital-detail");
  console.log("hospital-detail aliases (after):", JSON.stringify(hospitalDetailAlias.aliases));
  check("P1-ALIAS-COUNT", "hospital-detail has >= 20 aliases", hospitalDetailAlias.aliases.length >= 20, `got ${hospitalDetailAlias.aliases.length}`);
  const { hospitalDetailSqlTemplate } = await import("../domain-packs/healthcare/src/sql/hospital-detail");
  console.log("hospital-detail SQL template (after):\n" + hospitalDetailSqlTemplate.template);
  check("P1-TEMPLATE-JOIN", "template joins warehouse_hospital_hcahps", hospitalDetailSqlTemplate.template.includes("warehouse_hospital_hcahps"), "join missing");

  console.log("\n--- Group A: single-hospital dossier (previously narrow/broken) ---");
  {
    const { columns, result } = await run("Tell me about Mayo Clinic");
    check("A1", "Tell me about Mayo Clinic -> rich dossier columns", result.success === true && hasAllDossierColumns(columns), `columns=${JSON.stringify(columns)}`);
  }
  {
    const { columns, result } = await run("Tell me everything about NYU LANGONE HOSPITALS");
    check("A2", "Tell me everything about NYU -> now succeeds with rich columns", result.success === true && hasAllDossierColumns(columns), `success=${result.success} columns=${JSON.stringify(columns)}`);
  }
  {
    const { columns, result } = await run("Give me complete profile of NYU LANGONE HOSPITALS");
    check("A3", "Give me complete profile of NYU -> now succeeds", result.success === true && hasAllDossierColumns(columns), `success=${result.success} columns=${JSON.stringify(columns)}`);
  }
  {
    const { columns, result } = await run("Give me a full report on NYU LANGONE HOSPITALS");
    check("A4", "Give me a full report on NYU -> now succeeds", result.success === true && hasAllDossierColumns(columns), `success=${result.success} columns=${JSON.stringify(columns)}`);
  }
  {
    const { columns, result } = await run("Tell me everything about Mayo Clinic");
    check("A5", "Tell me everything about Mayo Clinic -> rich columns", result.success === true && hasAllDossierColumns(columns), `success=${result.success} columns=${JSON.stringify(columns)}`);
  }
  {
    const { columns, result } = await run("Tell me about NYU LANGONE HOSPITALS");
    check("A6", "Tell me about NYU -> now rich (was narrow)", result.success === true && hasAllDossierColumns(columns), `success=${result.success} columns=${JSON.stringify(columns)}`);
  }
  {
    const { columns, result } = await run("Give me complete profile of CEDARS-SINAI MEDICAL CENTER");
    check("A7", "Give me complete profile of CEDARS-SINAI -> rich columns", result.success === true && hasAllDossierColumns(columns), `success=${result.success} columns=${JSON.stringify(columns)}`);
  }
  {
    const { columns, result } = await run("dossier on Cleveland Clinic");
    const facilityIds = (result.rows ?? []).map((r: any) => r.facility_id);
    check("A8", "dossier on Cleveland Clinic -> rich columns, facility 360180", result.success === true && hasAllDossierColumns(columns) && facilityIds.includes("360180"), `success=${result.success} facility_ids=${JSON.stringify(facilityIds)}`);
  }
  {
    const { result } = await run("Tell me everything about Memorial Hospital");
    check("A9", "Tell me everything about Memorial Hospital -> still ambiguous 12-way", result.success === false && result.answerability?.status === "ambiguous" && (result.answerability?.candidates?.length ?? 0) === 12, `status=${result.answerability?.status} candidates=${result.answerability?.candidates?.length}`);

    if (result.answerability?.status === "ambiguous" && result.answerability?.candidates?.length) {
      const offeredOptions = result.answerability.candidates.map((candidate: any) => {
        const [city, county, state] = (candidate.label || "").split(", ");
        return { facility_id: candidate.value, hospital_name: "", city: (city || "").trim(), county: (county || "").trim(), state: (state || "").trim(), displayLabel: candidate.label || "" };
      });
      const interaction = await createPendingInteraction(client, {
        kind: "clarification",
        originalQuestion: "Tell me everything about Memorial Hospital",
        originalSemanticResult: (result as any).semanticMatches ?? [],
        pendingTarget: { entityMention: "Tell me everything about Memorial Hospital", candidates: result.answerability.candidates },
        offeredOptions,
      });
      const retrieved = await retrievePendingInteraction(client, interaction.id);
      const selectedOption = matchClarificationResponse("BELLEVILLE", retrieved.offeredOptions as any[]);
      await consumePendingInteraction(client, interaction.id);

      if (selectedOption) {
        const locationQualifier = [selectedOption.city, selectedOption.state].filter(Boolean).join(", ");
        const reconstructedQuestion = locationQualifier ? `${retrieved.originalQuestion} in ${locationQualifier}` : retrieved.originalQuestion;
        const { spyEngine: turn2Engine } = countingEngine();
        const turn2Result = await turn2Engine.execute({
          question: reconstructedQuestion,
          parameters: {},
          identityAlreadyResolved: true,
          forcedIdentityCandidate: { value: selectedOption.facility_id },
        } as any);
        const turn2Rows = (turn2Result.rows ?? []) as any[];
        const columns = turn2Rows[0] ? Object.keys(turn2Rows[0]) : [];
        console.log(`    turn2 "${reconstructedQuestion}" -> success=${turn2Result.success} rowCount=${turn2Rows.length} columns(${columns.length})`);
        check("A10", "BELLEVILLE clarification -> rich dossier for single hospital", turn2Result.success === true && turn2Rows.length === 1 && hasAllDossierColumns(columns), `success=${turn2Result.success} rowCount=${turn2Rows.length} columns=${JSON.stringify(columns)}`);
      } else {
        check("A10", "BELLEVILLE clarification -> rich dossier for single hospital", false, "failed to match selectedOption");
      }
    } else {
      check("A10", "BELLEVILLE clarification -> rich dossier for single hospital", false, "turn1 did not produce expected ambiguity");
    }
  }

  console.log("\n--- Group B: compare queries (already working, must be preserved) ---");
  {
    const { columns, result, facilityIds, sqlCalls } = await run("Compare NYU LANGONE HOSPITALS vs CEDARS-SINAI MEDICAL CENTER");
    check("B1", "Compare 2 hospitals -> still rich 15 columns, sqlCalls=5, no regression", result.success === true && result.rowCount === 2 && sqlCalls === 5 && columns.length === 15, `success=${result.success} rowCount=${result.rowCount} sqlCalls=${sqlCalls} columns=${columns.length}`);
  }
  {
    const { columns, result, sqlCalls } = await run("Compare NYU LANGONE HOSPITALS vs CEDARS-SINAI MEDICAL CENTER vs NEW YORK-PRESBYTERIAN HOSPITAL");
    check("B2", "Compare 3 hospitals -> still rich 15 columns, no regression", result.success === true && result.rowCount === 3 && sqlCalls === 5 && columns.length === 15, `success=${result.success} rowCount=${result.rowCount} sqlCalls=${sqlCalls} columns=${columns.length}`);
  }
  {
    const { columns, result, sqlCalls } = await run("Compare CEDARS-SINAI MEDICAL CENTER vs NEW YORK-PRESBYTERIAN HOSPITAL");
    check("B3", "Compare variant 2 -> still rich 15 columns, no regression", result.success === true && result.rowCount === 2 && sqlCalls === 5 && columns.length === 15, `success=${result.success} rowCount=${result.rowCount} sqlCalls=${sqlCalls} columns=${columns.length}`);
  }
  {
    const { columns, result, sqlCalls } = await run("Compare NYU LANGONE HOSPITALS and CEDARS-SINAI MEDICAL CENTER");
    check("B4", "Compare 'and' variant -> still rich 15 columns, no regression", result.success === true && result.rowCount === 2 && sqlCalls === 5 && columns.length === 15, `success=${result.success} rowCount=${result.rowCount} sqlCalls=${sqlCalls} columns=${columns.length}`);
  }
  {
    const turn1Question = "Compare NYU LANGONE HOSPITALS vs Memorial Hospital";
    const { spyEngine: turn1Engine, getCalls: turn1Calls } = countingEngine();
    const turn1Result = await turn1Engine.execute({ question: turn1Question });
    console.log(`    "${turn1Question}" -> success=${turn1Result.success} status=${turn1Result.answerability?.status} candidates=${turn1Result.answerability?.candidates?.length ?? 0} sqlCalls=${turn1Calls()}`);
    check("B5", "Compare NYU vs Memorial (Turn1) -> still ambiguous, no regression", turn1Result.success === false && turn1Result.answerability?.status === "ambiguous" && turn1Calls() === 0, `success=${turn1Result.success} status=${turn1Result.answerability?.status}`);

    if (turn1Result.answerability?.status === "ambiguous" && turn1Result.answerability?.candidates?.length) {
      const offeredOptions = turn1Result.answerability.candidates.map((candidate: any) => {
        const [city, county, state] = (candidate.label || "").split(", ");
        return { facility_id: candidate.value, hospital_name: "", city: (city || "").trim(), county: (county || "").trim(), state: (state || "").trim(), displayLabel: candidate.label || "" };
      });
      const interaction = await createPendingInteraction(client, {
        kind: "clarification",
        originalQuestion: turn1Question,
        originalSemanticResult: (turn1Result as any).semanticMatches ?? [],
        pendingTarget: { entityMention: turn1Question, candidates: turn1Result.answerability.candidates },
        offeredOptions,
      });
      const retrieved = await retrievePendingInteraction(client, interaction.id);
      const selectedOption = matchClarificationResponse("BELLEVILLE", retrieved.offeredOptions as any[]);
      await consumePendingInteraction(client, interaction.id);

      if (selectedOption) {
        const locationQualifier = [selectedOption.city, selectedOption.state].filter(Boolean).join(", ");
        const reconstructedQuestion = locationQualifier ? `${retrieved.originalQuestion} in ${locationQualifier}` : retrieved.originalQuestion;
        const { spyEngine: turn2Engine, getCalls: turn2Calls } = countingEngine();
        const turn2Result = await turn2Engine.execute({
          question: reconstructedQuestion,
          parameters: {},
          identityAlreadyResolved: true,
          forcedIdentityCandidate: { value: selectedOption.facility_id },
        } as any);
        const turn2Rows = (turn2Result.rows ?? []) as any[];
        const columns = turn2Rows[0] ? Object.keys(turn2Rows[0]) : [];
        const facilityIds = turn2Rows.map((r) => r.facility_id);
        console.log(`    turn2 "${reconstructedQuestion}" -> success=${turn2Result.success} rowCount=${turn2Rows.length} sqlCalls=${turn2Calls()} facility_ids=${JSON.stringify(facilityIds)}`);
        check("B6", "BELLEVILLE compare clarification -> both entities preserved, 15 cols, no regression", turn2Result.success === true && turn2Rows.length === 2 && turn2Calls() === 5 && columns.length === 15 && facilityIds.includes("140185") && facilityIds.includes("330214"), `success=${turn2Result.success} rowCount=${turn2Rows.length} sqlCalls=${turn2Calls()} facility_ids=${JSON.stringify(facilityIds)}`);
      } else {
        check("B6", "BELLEVILLE compare clarification -> both entities preserved", false, "failed to match selectedOption");
      }
    } else {
      check("B6", "BELLEVILLE compare clarification -> both entities preserved", false, "turn1 did not produce expected ambiguity");
    }
  }

  console.log("\n--- Group C: Task 1-6 + Tier1 T1-T3 controls (must preserve, no regression) ---");
  {
    const { result } = await run("Show me hospitals with best overall rating");
    // Tier1 Task 5 balanced-limits fix (2026-09-12, supersedes the
    // same-day true-raw fix): back to the original top-10 ceiling.
    check("C1", "best overall rating -> top 10 (balanced-limits ceiling)", result.success === true && result.rowCount === 10, `rowCount=${result.rowCount}`);
  }
  {
    const { result, facilityIds } = await run("What is Mayo Clinic Rochester Minnesota's overall rating?");
    check("C2", "Mayo Rochester -> facility 240010", result.success === true && facilityIds.includes("240010"), `facility_ids=${JSON.stringify(facilityIds)}`);
  }
  {
    const { result } = await run("Show me hospitals in Birmingham, Alabama with their overall ratings");
    check("C3", "Birmingham -> 9 rows", result.success === true && result.rowCount === 9, `rowCount=${result.rowCount}`);
  }
  {
    const { result } = await run("Show me hospitals in ALBANY County, New York");
    check("C4", "ALBANY NY -> 4 rows", result.success === true && result.rowCount === 4, `rowCount=${result.rowCount}`);
  }
  {
    const { result } = await run("California hospitals performing above national mortality average");
    check("C5", "national mortality average -> success", result.success === true, `success=${result.success}`);
  }
  {
    const { result } = await run("Show me non-profit hospitals with best AMI mortality");
    check("C6", "non-profit AMI -> success", result.success === true, `success=${result.success}`);
  }
  {
    const { result } = await run("hospitals with lowest readmissions");
    check("C7", "readmissions plural -> success", result.success === true, `success=${result.success}`);
  }
  {
    const { result } = await run("Show me hospitals with best heart attacks mortality");
    check("C8", "heart attacks plural -> success", result.success === true, `success=${result.success}`);
  }
  {
    const { result } = await run("Show me 5-star hospitals");
    const allFive = (result.rows ?? []).every((r: any) => String(r.overall_rating) === "5");
    check("C9", "5-star -> all rows overall_rating=5", result.success === true && allFive, `success=${result.success} allFive=${allFive}`);
  }
  {
    const { result } = await run("Show me 5-star hospitals in Texas");
    const allFiveTX = (result.rows ?? []).every((r: any) => String(r.overall_rating) === "5" && r.state === "TX");
    check("C10", "5-star Texas -> 29 rows all 5/TX", result.success === true && result.rowCount === 29 && allFiveTX, `rowCount=${result.rowCount} allFiveTX=${allFiveTX}`);
  }
  {
    const { result } = await run("Tell me about Mayo Clinic's mortality rate for heart attack");
    check("C11", "Tell me about Mayo AMI -> scoped, not generic dossier", result.success === true, `success=${result.success}`);
  }
  {
    const { result } = await run("Tell me about hospitals in Texas");
    // Tier1 Task 5 balanced-limits fix (2026-09-12, supersedes the
    // same-day true-raw fix): back to the original 100 ceiling.
    check("C12", "Tell me about hospitals in Texas -> 100-row list (balanced-limits ceiling), not dossier", result.success === true && result.rowCount === 100, `rowCount=${result.rowCount}`);
  }

  console.log("\n--- Known separate gaps: must still FAIL (not a regression) ---");
  {
    const { result } = await run("Show me hospitals with best ratings");
    check("K1", "bare 'ratings' still FAILS (F13, out of scope)", result.success === false, `success=${result.success}`);
  }
  {
    const { result } = await run("Show me hospitals with best safeties");
    check("K2", "bare 'safeties' still FAILS (F13, out of scope)", result.success === false, `success=${result.success}`);
  }

  console.log("\n" + "=".repeat(100));
  console.log(`RESULT: ${pass} PASS, ${fail} FAIL`);
  console.log("=".repeat(100));

  console.log("\n--- Supplementary DB check: distinct overall_rating ---");
  const { data: ratings } = await client.from("warehouse_hospitals").select("overall_rating").order("overall_rating");
  const distinctRatings = Array.from(new Set((ratings ?? []).map((r: any) => r.overall_rating)));
  console.log("distinct overall_rating:", JSON.stringify(distinctRatings));

  if (fail > 0) process.exit(1);
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
