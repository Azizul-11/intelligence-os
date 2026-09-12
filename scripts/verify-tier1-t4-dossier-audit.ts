/**
 * Pre-Phase 9 Tier1 Task 4 Audit: Single-Hospital Cross-Table Dossier
 * Generation + 2-3 Hospital Compare + Same-Name Clarification.
 *
 * STRICTLY DIAGNOSTIC - read-only, no production writes. Live, in-process,
 * spy-instrumented against the remote Supabase warehouse.
 *
 * Run: npx tsx scripts/verify-tier1-t4-dossier-audit.ts
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

interface Row { id: string; question: string; result: any; sqlCalls: number; }
const rows: Row[] = [];

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

async function run(id: string, question: string) {
  const { spyEngine, getCalls } = countingEngine();
  const result = await spyEngine.execute({ question });
  const sqlCalls = getCalls();
  rows.push({ id, question, result, sqlCalls });

  const rowSample = (result.rows ?? [])[0];
  const columns = rowSample ? Object.keys(rowSample) : [];
  const facilityIds = (result.rows ?? []).map((r: any) => r.facility_id);
  console.log(
    `[${id}] "${question}" -> success=${result.success} status=${result.answerability?.status} reason=${result.answerability?.reason ?? ""} rowCount=${result.rowCount ?? 0} sqlCalls=${sqlCalls} error=${JSON.stringify(result.error)} columns(${columns.length})=${JSON.stringify(columns)} facility_ids=${JSON.stringify(facilityIds)}`,
  );
  if (rowSample) console.log("  sample:", JSON.stringify(rowSample));
  return result;
}

async function main() {
  console.log("=".repeat(100));
  console.log("TIER1 TASK 4 AUDIT: DOSSIER GENERATION + COMPARE + SAME-NAME CLARIFICATION (READ-ONLY)");
  console.log("=".repeat(100));

  console.log("\n--- Group A1: single-hospital dossier (current bug) ---");
  await run("A1-TELL-ME-ABOUT-MAYO", "Tell me about Mayo Clinic");
  await run("A2-TELL-ME-EVERYTHING-NYU", "Tell me everything about NYU LANGONE HOSPITALS");
  await run("A3-COMPLETE-PROFILE-NYU", "Give me complete profile of NYU LANGONE HOSPITALS");

  console.log("\n--- Group A2: 2-3 hospital compare (does it already work?) ---");
  await run("A4-COMPARE-2-VS", "Compare NYU LANGONE HOSPITALS vs CEDARS-SINAI MEDICAL CENTER");
  await run("A5-COMPARE-3-VS", "Compare NYU LANGONE HOSPITALS vs CEDARS-SINAI MEDICAL CENTER vs NEW YORK-PRESBYTERIAN HOSPITAL");
  await run("A6-COMPARE-2-VARIANT", "Compare CEDARS-SINAI MEDICAL CENTER vs NEW YORK-PRESBYTERIAN HOSPITAL");
  await run("A7-COMPARE-AND", "Compare NYU LANGONE HOSPITALS and CEDARS-SINAI MEDICAL CENTER");

  console.log("\n--- Group A3: same-name clarification during compare (two-turn) ---");
  {
    const turn1Question = "Compare NYU LANGONE HOSPITALS vs Memorial Hospital";
    const { spyEngine: turn1Engine, getCalls: turn1Calls } = countingEngine();
    const turn1Result = await turn1Engine.execute({ question: turn1Question });
    console.log(
      `[A8-COMPARE-TURN1] "${turn1Question}" -> success=${turn1Result.success} status=${turn1Result.answerability?.status} reason=${turn1Result.answerability?.reason} candidateCount=${turn1Result.answerability?.candidates?.length ?? 0} sqlCalls=${turn1Calls()}`,
    );

    if (
      !turn1Result.success &&
      turn1Result.answerability?.status === "ambiguous" &&
      turn1Result.answerability?.candidates?.length
    ) {
      const offeredOptions = turn1Result.answerability.candidates.map((candidate: any) => {
        const [city, county, state] = (candidate.label || "").split(", ");
        return {
          facility_id: candidate.value,
          hospital_name: "",
          city: (city || "").trim(),
          county: (county || "").trim(),
          state: (state || "").trim(),
          displayLabel: candidate.label || "",
        };
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
        console.log(
          `[A9-COMPARE-TURN2-BELLEVILLE] "${reconstructedQuestion}" -> success=${turn2Result.success} status=${turn2Result.answerability?.status} rowCount=${turn2Rows.length} sqlCalls=${turn2Calls()} columns(${columns.length})=${JSON.stringify(columns)} facility_ids=${JSON.stringify(turn2Rows.map((r) => r.facility_id))}`,
        );
        if (turn2Rows[0]) console.log("  sample:", JSON.stringify(turn2Rows[0]));
      } else {
        console.log("[A9-COMPARE-TURN2-BELLEVILLE] FAILED TO MATCH selectedOption");
      }
    }
  }

  console.log("\n--- Group A4: same-name clarification for single-hospital dossier ---");
  await run("A10-TELL-ME-EVERYTHING-MEMORIAL", "Tell me everything about Memorial Hospital");

  console.log("\n--- Group B: Task 1-6 + Tier1 T1-T3 preservation controls ---");
  await run("B1-BEST-OVERALL-RATING", "Show me hospitals with best overall rating");
  await run("B2-MAYO-ROCHESTER", "What is Mayo Clinic Rochester Minnesota's overall rating?");
  await run("B3-BIRMINGHAM", "Show me hospitals in Birmingham, Alabama with their overall ratings");
  await run("B4-ALBANY-NY", "Show me hospitals in ALBANY County, New York");
  await run("B5-NATIONAL-MORTALITY-AVG", "California hospitals performing above national mortality average");
  await run("B6-NONPROFIT-AMI", "Show me non-profit hospitals with best AMI mortality");
  await run("B7-READMISSIONS-PLURAL", "hospitals with lowest readmissions");
  await run("B8-HEART-ATTACKS-PLURAL", "Show me hospitals with best heart attacks mortality");
  await run("B9-5STAR", "Show me 5-star hospitals");
  await run("B10-5STAR-TEXAS", "Show me 5-star hospitals in Texas");
  await run("B11-TELL-ME-ABOUT-MAYO-AMI", "Tell me about Mayo Clinic's mortality rate for heart attack");
  await run("B12-TELL-ME-ABOUT-TEXAS", "Tell me about hospitals in Texas");

  console.log("\n" + "=".repeat(100));
  console.log("SUMMARY TABLE");
  console.log("=".repeat(100));
  for (const row of rows) {
    console.log(`${row.id}: success=${row.result.success} status=${row.result.answerability?.status ?? ""} rowCount=${row.result.rowCount ?? 0} sqlCalls=${row.sqlCalls}`);
  }

  console.log("\n--- Supplementary DB check: warehouse_hospitals full schema (facility 100151) ---");
  const { data: schemaRow } = await client.from("warehouse_hospitals").select("*").eq("facility_id", "100151").limit(1);
  console.log("COLUMNS:", schemaRow && schemaRow[0] ? JSON.stringify(Object.keys(schemaRow[0])) : "none");

  console.log("\n--- Supplementary DB check: warehouse_hospital_hcahps sample ---");
  const { data: hcahpsRow } = await client.from("warehouse_hospital_hcahps").select("*").eq("facility_id", "100151").limit(2);
  console.log(JSON.stringify(hcahpsRow, null, 2));
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
