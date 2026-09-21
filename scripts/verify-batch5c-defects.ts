#!/usr/bin/env tsx

/**
 * Batch 5C (the 11 engine defects of the V2 800-query sweep) verification. No live model call: the model is stubbed (the hook's
 * `normalize` argument), so everything asserted here is deterministic and free. The engine runs against the live warehouse
 * (read-only SELECTs); a refusal never reaches it.
 *
 *   1  canonical repairs: a procedure is ranked by its mortality, a bare "Show me hospitals" means the overall rating
 *   2  the vocabulary reads a possessive ("my wife's heart checkup") with no model call
 *   3  the scope topics: telephone, bay area, symptoms of, similar to (and what must still pass)
 *   4  hospital names: "Cedars Sinai" is one facility, "Sarasota Memorial" is two campuses
 *   5  the engine: the scope check runs for a question that skips the front door, an entity's own words are not a topic, and a
 *      comparison with a name that does not exist is refused instead of asking "which measure?"
 *
 * Usage: pnpm exec tsx scripts/verify-batch5c-defects.ts
 */
import "dotenv/config";

import { createClient } from "@supabase/supabase-js";
import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { DOMAIN_CAPABILITIES } from "../domain-packs/healthcare/src/runtime/capability-catalog";
import { HealthcareEntityProvider, normalizeText, STATES } from "../domain-packs/healthcare/src/runtime/entity-provider";
import { COUNTIES, CITIES } from "../domain-packs/healthcare/src/runtime/geographic-directory";
import { HOSPITAL_ALIASES } from "../domain-packs/healthcare/src/runtime/hospital-alias-directory";
import { HOSPITAL_FAMILIES } from "../domain-packs/healthcare/src/runtime/hospital-family-directory";
import { hospitalIdentityDirectory } from "../domain-packs/healthcare/src/runtime/hospital-identity-directory";
import { HEALTHCARE_FILLER_WORDS, correctPlaceCollidingTypos, scopeGuidanceChips } from "../domain-packs/healthcare/src/runtime/lay-vocabulary";
import { expandUppercaseStateAbbreviations } from "../domain-packs/healthcare/src/runtime/state-abbreviation-preprocessor";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { SqlExecutor } from "../packages/sql-executor/src/sql-executor";
import { SupabaseDatabaseAdapter } from "../packages/sql-executor/src/supabase-database-adapter";
import { normalizeQuestion, precheckUnsupported, repairCanonical } from "../supabase/functions/orchestrator/services/normalizer-hook";
import { env } from "./shared/env";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  [PASS] ${name}`);
  } else {
    failed++;
    console.log(`  [FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
}

const repaired = (question: string): string => {
  const result = repairCanonical({ canonicalQuestion: question, meta: {} }, DOMAIN_CAPABILITIES);
  return result && "canonicalQuestion" in result ? result.canonicalQuestion : "";
};

async function main() {
  // -------------------------------------------------------------------------------------------- 1. canonical repairs
  console.log("\n1 - canonical repairs");
  check("best CABG -> lowest CABG mortality, place kept", repaired("Show me hospitals with best CABG in Michigan") === "Show me hospitals with lowest Mortality Rate for CABG in Michigan", repaired("Show me hospitals with best CABG in Michigan"));
  check("the model's long form is repaired too", repaired("Show me hospitals with best Coronary Artery Bypass Graft in Michigan") === "Show me hospitals with lowest Mortality Rate for CABG in Michigan");
  check("no place: the question ends there", repaired("Show me hospitals with top Bypass Surgery") === "Show me hospitals with lowest Mortality Rate for CABG");
  check("worst CABG -> highest mortality", repaired("Show me hospitals with worst CABG in Ohio") === "Show me hospitals with highest Mortality Rate for CABG in Ohio");
  check("a bare `Show me hospitals` means the overall rating", repaired("Show me hospitals") === "Show me best hospitals" && repaired("Show me hospitals.") === "Show me best hospitals");
  check("a question that is already answerable is left alone", repaired("Show me hospitals in Nevada") === "Show me hospitals in Nevada" && repaired("Show me hospitals with lowest Mortality Rate for CABG in Michigan") === "Show me hospitals with lowest Mortality Rate for CABG in Michigan" && repaired("Show me best hospitals") === "Show me best hospitals");
  check("the earlier repair still works", repaired("Show me hospitals with best Safety Performance for Pneumonia") === "Show me hospitals with lowest Mortality Rate for Pneumonia");

  // -------------------------------------------------------------------------------------------- 2. possessive
  console.log("\n2 - the vocabulary reads a possessive");
  {
    let modelCalls = 0;
    const result: any = await normalizeQuestion("I want a hospital recommendation for my wife's heart checkup in Maryland", DOMAIN_CAPABILITIES, async () => {
      modelCalls++;
      return { status: "fallback" };
    });
    check("mapped by the vocabulary with no model call", modelCalls === 0 && result?.meta?.source === "lay-vocabulary", JSON.stringify(result));
    check("heart checkup is read as heart attack mortality, Maryland kept", result?.canonicalQuestion === "Show me hospitals with lowest Mortality Rate for Acute Myocardial Infarction in Maryland", String(result?.canonicalQuestion));
    const other: any = await normalizeQuestion("what's the best hospital for chest pain in Ohio", DOMAIN_CAPABILITIES, async () => ({ status: "fallback" }));
    check("`what's` maps the same way", other?.canonicalQuestion === "Show me hospitals with lowest Mortality Rate for Acute Myocardial Infarction in Ohio", String(other?.canonicalQuestion));
  }

  // -------------------------------------------------------------------------------------------- 3. scope topics
  console.log("\n3 - the scope topics");
  const hits = (q: string) => precheckUnsupported(q, DOMAIN_CAPABILITIES);
  check("telephone numbers are refused", hits("What are the telephone numbers for heart hospitals in Montgomery?").join() === "telephone" && hits("phone numbers of hospitals in Ohio").join() === "phone numbers");
  check("the Bay Area is refused", hits("hospitals in the bay area").join() === "bay area");
  check("the symptoms of a condition are refused", hits("what are the symptoms of pneumonia").join() === "symptoms of");
  check("hospitals similar to another are refused", hits("hospitals similar to CLEVELAND CLINIC").join() === "similar to");
  check("a place or plain wording that only looks similar is not", hits("hospitals in Bay County").length === 0 && hits("pneumonia symptoms, hospital in Ohio").length === 0 && hits("my dad had a heart attack last month, which hospital is safest for him").length === 0 && hits("Tell me about Mayo Clinic").length === 0);
  for (const question of ["telephone numbers in Texas", "hospitals in the bay area", "what are the symptoms of pneumonia", "hospitals similar to Mayo Clinic"]) {
    check(`the refusal offers answerable questions: "${question}"`, (scopeGuidanceChips(question)?.length ?? 0) === 3, String(scopeGuidanceChips(question)));
  }

  // -------------------------------------------------------------------------------------------- 4. hospital names
  console.log("\n4 - hospital names");
  {
    const provider = new HealthcareEntityProvider();
    const cedars = hospitalIdentityDirectory.filter((record) => normalizeText(record.hospitalName) === "cedars sinai medical center");
    const resolvedCedars: any = provider.resolve("cedars sinai");
    check("`Cedars Sinai` is the one facility CEDARS-SINAI MEDICAL CENTER", cedars.length === 1 && resolvedCedars.found === true && resolvedCedars.value === cedars[0]!.facilityId, JSON.stringify(resolvedCedars));
    const resolvedSarasota: any = provider.resolve("sarasota memorial");
    check("`Sarasota Memorial` is a question about which campus", resolvedSarasota.found === false && resolvedSarasota.status === "ambiguous" && resolvedSarasota.candidates?.length === 2, JSON.stringify(resolvedSarasota).slice(0, 200));
    const exact: any = provider.resolve("sarasota memorial hospital");
    check("the exact official name still resolves to one facility", exact.found === true, JSON.stringify(exact));
    check("the other Cedars facility is untouched", (provider.resolve("providence cedars sinai tarzana medical center") as any).found === true);
    for (const [alias, official] of Object.entries(HOSPITAL_ALIASES)) {
      const officialRecords = hospitalIdentityDirectory.filter((record) => normalizeText(record.hospitalName) === official);
      const taken = hospitalIdentityDirectory.some((record) => normalizeText(record.hospitalName) === alias) || STATES.has(alias) || CITIES.has(alias) || COUNTIES.has(alias);
      check(`alias "${alias}": one official facility, and it is no place or official name`, officialRecords.length === 1 && !taken);
    }
    for (const family of HOSPITAL_FAMILIES) {
      const members = hospitalIdentityDirectory.filter((record) => normalizeText(record.hospitalName).startsWith(`${family} `));
      const place = STATES.has(family) || CITIES.has(family) || COUNTIES.has(family);
      check(`family "${family}": at least two facilities, and it is no place`, members.length >= 2 && !place, `${members.length} members`);
    }
  }

  // -------------------------------------------------------------------------------------------- 5. engine
  console.log("\n5 - the engine (front door wired, model stubbed)");
  {
    process.env.LLM_FIRST_FRONT_DOOR_ENABLED = "true";
    const runtime = createDomainRuntime(healthcareDomain);
    const sqlExecutor = new SqlExecutor(new SupabaseDatabaseAdapter(createClient(env.supabaseUrl, env.supabaseServiceRoleKey)));
    const replies: Record<string, any> = {
      "Compare Zzzznotarealhospital and Cleveland Clinic.": { status: "need_clarification", canonical_question: null, reason: "Which measure should I compare them on?" },
      "compare hospitals": { status: "need_clarification", canonical_question: null, reason: "Which measure should I compare them on?" },
    };
    const build = (withPrecheck: boolean) =>
      createRuntimeEngine({
        runtime,
        semantic: createSemanticResolver(runtime.registry, runtime.entityProvider),
        planner: new QueryPlanner({ fillerWords: HEALTHCARE_FILLER_WORDS }),
        executionPlanMapper: new ExecutionPlanMapper(),
        executor: sqlExecutor,
        preprocessQuestion: (question: string) => expandUppercaseStateAbbreviations(correctPlaceCollidingTypos(question)),
        llmFallback: ((question: string) => normalizeQuestion(question, DOMAIN_CAPABILITIES, async () => replies[question] ?? { status: "fallback" })) as any,
        ...(withPrecheck ? { unsupportedPrecheck: (question: string) => precheckUnsupported(question, DOMAIN_CAPABILITIES) } : {}),
      });
    const engine = build(true);
    const realLog = console.log;
    const run = async (question: string, target = engine): Promise<any> => {
      console.log = () => {};
      try {
        return await target.execute({ question });
      } finally {
        console.log = realLog;
      }
    };
    const sqlCalls = (r: any) => (r.trace ?? []).reduce((sum: number, g: any) => sum + (g.sqlCalls ?? 0), 0);
    const gateOf = (r: any, phase = "llm-normalization") => [...(r.trace ?? [])].reverse().find((g: any) => g.phase === phase);

    for (const [question, topic] of [["Was Mayo Clinic's overall rating better 5 years ago?", "years ago"], ["hospitals similar to CLEVELAND CLINIC", "similar to"], ["what's the address of Mayo Clinic Hospital", "address"]] as const) {
      const r = await run(question);
      const g = gateOf(r);
      check(`a named-hospital question that asks for "${topic}" is refused with 0 SQL`, r.success === false && sqlCalls(r) === 0 && g?.status === "unsupported" && g.detail?.source === "pre-check" && g.detail?.unsupportedTerms === topic, JSON.stringify(g));
    }
    const children = await run("Tell me about Children's Hospital of Philadelphia");
    check("a hospital whose own name holds a topic word is still answered", children.success === true && children.rowCount === 1, `success=${children.success} rows=${children.rowCount} error=${children.error}`);
    const off = build(false);
    const withoutCheck = await run("Was Mayo Clinic's overall rating better 5 years ago?", off);
    check("without the option nothing changes (no scope refusal)", gateOf(withoutCheck)?.status !== "unsupported", JSON.stringify(gateOf(withoutCheck)));

    const unknown = await run("Compare Zzzznotarealhospital and Cleveland Clinic.");
    const guard = gateOf(unknown, "unaccounted-word-guard");
    check("a comparison with a name that does not exist is refused with 0 SQL, not asked about", unknown.success === false && sqlCalls(unknown) === 0 && unknown.error !== "Which measure should I compare them on?", `error=${unknown.error}`);
    check("the unknown word is named on the trace and the model's question is not used", guard?.status === "refused" && guard.detail?.unaccountedWords === "zzzznotarealhospital" && gateOf(unknown)?.status === "unavailable", JSON.stringify([guard, gateOf(unknown)]));
    const bare = await run("compare hospitals");
    check("a comparison with no name still asks which measure", bare.error === "Which measure should I compare them on?" && gateOf(bare)?.status === "clarification", `error=${bare.error} gate=${gateOf(bare)?.status}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log(`RESULT: ${passed} passed, ${failed} failed (${passed + failed} total)`);
  console.log("=".repeat(60));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
