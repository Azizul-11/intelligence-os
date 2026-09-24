#!/usr/bin/env tsx

/**
 * Batch 5B-3 (granular HCAHPS patient-survey dimensions) verification. No live model is called: the engine runs with
 * the real pre-check and lay vocabulary and a stubbed model (`fallback`, or a scripted reply where a check needs one),
 * against the live warehouse (read-only SELECTs).
 *
 *   1  registry and prompt: 9 concepts, topics, the SURVEY TOPICS rule, CONDITIONS unchanged
 *   2  the owned catalog rows: dimension, higher-is-better order, star rating; the composite is unchanged
 *   3  direction, routing siblings (listing phrase, multi-state compare)
 *   4  D4 clarification (0 SQL), D9 note, canonical repairs
 *   5  Phase 8: what stays refused, 0 SQL
 *
 * Usage: pnpm exec tsx scripts/verify-batch5b3-hcahps.ts
 */
import "dotenv/config";

import { healthcareDomain, DOMAIN_CAPABILITIES } from "../domain-packs/healthcare/src/index";
import { HEALTHCARE_FILLER_WORDS } from "../domain-packs/healthcare/src/runtime/lay-vocabulary";
import { expandUppercaseStateAbbreviations } from "../domain-packs/healthcare/src/runtime/state-abbreviation-preprocessor";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { SqlExecutor } from "../packages/sql-executor/src/sql-executor";
import { SupabaseDatabaseAdapter } from "../packages/sql-executor/src/supabase-database-adapter";
import { LLMModelGateway } from "../packages/llm-model-gateway/src/llm-model-gateway";
import { normalizeQuestion } from "../supabase/functions/orchestrator/services/normalizer-hook";
import { createClient } from "@supabase/supabase-js";
import { env } from "./shared/env";

process.env.LLM_FIRST_FRONT_DOOR_ENABLED = "true";

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

type Reply = { status: "ok" | "need_clarification" | "fallback" | "unsupported"; canonical_question?: string | null; reason?: string | null };
const runtime = createDomainRuntime(healthcareDomain);
const executor = new SqlExecutor(new SupabaseDatabaseAdapter(createClient(env.supabaseUrl, env.supabaseServiceRoleKey)));
function makeEngine(reply: (q: string) => Reply = () => ({ status: "fallback" })) {
  return createRuntimeEngine({
    runtime,
    semantic: createSemanticResolver(runtime.registry, runtime.entityProvider),
    planner: new QueryPlanner({ fillerWords: HEALTHCARE_FILLER_WORDS }),
    executionPlanMapper: new ExecutionPlanMapper(),
    executor,
    preprocessQuestion: expandUppercaseStateAbbreviations,
    llmFallback: (q: string) => normalizeQuestion(q, DOMAIN_CAPABILITIES, async () => reply(q)),
  });
}
const engine = makeEngine();
const realLog = console.log;
async function runOn(target: ReturnType<typeof makeEngine>, question: string): Promise<any> {
  console.log = () => {};
  try {
    return await target.execute({ question });
  } finally {
    console.log = realLog;
  }
}
const run = (question: string) => runOn(engine, question);
const sqlCalls = (r: any) => (r.trace ?? []).reduce((sum: number, g: any) => sum + (g.sqlCalls ?? 0), 0);
const llmGate = (r: any) => [...(r.trace ?? [])].reverse().find((g: any) => g.phase === "llm-normalization" && g.status !== "enter");
const descending = (rows: any[]) => rows.every((r, i) => i === 0 || Number(r.score) <= Number(rows[i - 1].score));
const ascending = (rows: any[]) => rows.every((r, i) => i === 0 || Number(r.score) >= Number(rows[i - 1].score));

async function main() {
  // ------------------------------------------------------------------------------------------ 1. registry and prompt
  console.log("\n1 - registry and prompt");
  const DIMENSIONS: [string, string][] = [
    ["Cleanliness", "H_CLEAN_LINEAR_SCORE"], ["Nurse Communication", "H_COMP_1_LINEAR_SCORE"], ["Doctor Communication", "H_COMP_2_LINEAR_SCORE"],
    ["Communication About Medicines", "H_COMP_5_LINEAR_SCORE"], ["Discharge Information", "H_COMP_6_LINEAR_SCORE"], ["Quietness", "H_QUIET_LINEAR_SCORE"],
    ["Recommend Hospital", "H_RECMND_LINEAR_SCORE"], ["Overall Survey Rating", "H_HSP_RATING_LINEAR_SCORE"], ["Survey Summary Star", "H_STAR_RATING"],
  ];
  for (const [name, code] of DIMENSIONS) {
    const c = runtime.domain.concepts.find((x: any) => x.displayName === name) as any;
    check(`"${name}" is registered under patient-experience -> ${code}`, c?.measureCodesByMetric?.["patient-experience"] === code, JSON.stringify(c?.measureCodesByMetric));
  }
  for (const topic of ["cleanliness", "cleanest", "sanitary", "quietest", "nurse communication", "doctor communication", "communication about medicines", "discharge information", "instructions for going home"]) {
    check(`"${topic}" is no longer an unsupported topic`, !DOMAIN_CAPABILITIES.unsupportedTopics.includes(topic));
  }
  for (const topic of ["staff responsiveness", "responsiveness", "care transition", "listen carefully"]) {
    check(`"${topic}" stays an unsupported topic`, DOMAIN_CAPABILITIES.unsupportedTopics.includes(topic));
  }
  const probe = new LLMModelGateway([]);
  let prompt = "";
  (probe as any).runJSON = async (_chain: unknown, system: string) => ((prompt = system), { status: "fallback" });
  await probe.normalizeMessyLanguage("x", DOMAIN_CAPABILITIES);
  const conditionsLine = prompt.split("\n").find((line) => line.startsWith("CONDITIONS")) ?? "";
  check("the prompt names every survey topic in its own SURVEY TOPICS rule", DIMENSIONS.every(([name]) => prompt.includes(`SURVEY TOPICS (Patient Experience, higher is better): `) && prompt.includes(name)));
  check("the survey topics are not listed as clinical CONDITIONS", !/Cleanliness|Quietness|Survey Summary Star/.test(conditionsLine), conditionsLine.slice(0, 200));
  check("RULE 6 counts SURVEY TOPICS as supported, and no longer calls cleanliness unsupported", /outside METRICS, CONDITIONS, SURVEY TOPICS/.test(prompt) && !/cleanliness, staff communication/.test(prompt));
  check("the D4 clarification rule is in the prompt", /"communication" naming no nurses, doctors or medicines is need_clarification/.test(prompt));

  // ------------------------------------------------------------------------------------------ 2. owned rows
  console.log("\n2 - the batch's owned catalog rows (deterministic)");
  const ANSWERED: [string, string, string, string?][] = [
    ["B019", "cleanest hospitals", "H_CLEAN_LINEAR_SCORE"],
    ["B020", "hospitals with the cleanest rooms", "H_CLEAN_LINEAR_SCORE"],
    ["B021", "Which hospitals have the highest scores for cleanliness?", "H_CLEAN_LINEAR_SCORE"],
    ["B022", "most sanitary hospitals in Texas", "H_CLEAN_LINEAR_SCORE", "TX"],
    ["B023", "hospital room and bathroom cleanliness ranking", "H_CLEAN_LINEAR_SCORE"],
    ["B024", "quietest hospitals at night", "H_QUIET_LINEAR_SCORE"],
    ["B025", "hospitals where you can actually sleep", "H_QUIET_LINEAR_SCORE"],
    ["B026", "which hospitals are the quietest in Ohio", "H_QUIET_LINEAR_SCORE", "OH"],
    ["B027", "best nurse communication", "H_COMP_1_LINEAR_SCORE"],
    ["B030", "nurse communication scores in Florida", "H_COMP_1_LINEAR_SCORE", "FL"],
    ["B031", "best doctor communication", "H_COMP_2_LINEAR_SCORE"],
    ["B034", "communication about medicines", "H_COMP_5_LINEAR_SCORE"],
    ["B036", "discharge information ranking", "H_COMP_6_LINEAR_SCORE"],
    ["B037", "hospitals that give the best instructions for going home", "H_COMP_6_LINEAR_SCORE"],
    ["B038", "hospitals patients would recommend", "H_RECMND_LINEAR_SCORE"],
    ["B040", "patient experience star rating", "H_STAR_RATING"],
    ["B041", "Show me the 10 hospitals with the highest patient survey star ratings", "H_STAR_RATING"],
    ["B044", "cleanest hospitals in Texas", "H_CLEAN_LINEAR_SCORE", "TX"],
    ["V2D061", "hospitals with good nurse communication in Texas", "H_COMP_1_LINEAR_SCORE", "TX"],
  ];
  for (const [id, question, code, state] of ANSWERED) {
    const r = await run(question);
    const rows = r.rows ?? [];
    check(
      `${id} "${question}": ${code}, best first${state ? `, ${state} only` : ""}, star rating shown`,
      r.success === true && rows.length > 0 && rows.every((x: any) => x.measure_code === code && (!state || x.state === state)) && descending(rows) && rows[0].star_rating != null,
      `success=${r.success} rows=${rows.length} err=${r.error} first=${JSON.stringify(rows[0])}`,
    );
  }
  const composite = await run("Hospitals with best patient experience");
  check(
    "baseline: the composite 'Hospitals with best patient experience' still ranks the all-dimension average (no measure code)",
    composite.success === true && composite.rows.length > 0 && composite.rows[0].avg_patient_satisfaction !== undefined && composite.rows[0].measure_code === undefined && Number(composite.rows[0].avg_patient_satisfaction) === 97.5,
    JSON.stringify(composite.rows?.[0]),
  );

  // ------------------------------------------------------------------------------------------ 3. direction and routing siblings
  console.log("\n3 - direction and routing");
  const lowest = await run("lowest nurse communication scores in Ohio");
  check("'lowest nurse communication scores' is worst first (ascending)", lowest.success === true && lowest.rows.length > 0 && lowest.rows.every((x: any) => x.measure_code === "H_COMP_1_LINEAR_SCORE" && x.state === "OH") && ascending(lowest.rows), `success=${lowest.success} err=${lowest.error}`);
  const listing = await run("hospitals in Florida with the highest cleanliness scores");
  check("a listing phrase keeps the dimension ('hospitals in Florida ... cleanliness scores' is not a plain Florida list)", listing.success === true && listing.rows.length > 0 && listing.rows.every((x: any) => x.measure_code === "H_CLEAN_LINEAR_SCORE" && x.state === "FL"), `success=${listing.success} err=${listing.error} first=${JSON.stringify(listing.rows?.[0])}`);
  const compare = await run("compare nurse communication scores in Texas and Ohio");
  check("a two-state compare ranks the dimension, not the composite", compare.success === true && compare.rows.length > 0 && compare.rows.every((x: any) => x.measure_code === "H_COMP_1_LINEAR_SCORE"), `success=${compare.success} err=${compare.error} first=${JSON.stringify(compare.rows?.[0])}`);

  // ------------------------------------------------------------------------------------------ 4. D4, D9, repairs
  console.log("\n4 - D4 clarification, D9 note, canonical repairs");
  const clarifying = makeEngine((q) =>
    q === "hospitals with the best communication" ? { status: "need_clarification", reason: "Communication with nurses, with doctors, or about medicines?" } : { status: "fallback" },
  );
  const b045 = await runOn(clarifying, "hospitals with the best communication");
  check("B045 'best communication' is not answered by the deterministic layers (it reaches the model)", llmGate(b045) !== undefined && sqlCalls(b045) === 0, JSON.stringify(llmGate(b045)));
  check("B045 with the model's need_clarification: no answer, 0 SQL, the question is asked back", b045.success === false && sqlCalls(b045) === 0, `success=${b045.success} sql=${sqlCalls(b045)} err=${b045.error}`);
  const b022 = await run("most sanitary hospitals in Texas");
  check("D9: 'sanitary' is answered with a note saying it was read as Cleanliness", /Read 'most sanitary' as the Cleanliness patient-survey score/.test(String(llmGate(b022)?.detail?.interpretation)), JSON.stringify(llmGate(b022)?.detail));
  const repair = async (canonical: string) => (await normalizeQuestion("q", DOMAIN_CAPABILITIES, async () => ({ status: "ok", canonical_question: canonical }))) as any;
  check("repair: a dimension written as a metric becomes a Patient Experience question", (await repair("Show me hospitals with best Cleanliness in Texas"))?.canonicalQuestion === "Show me hospitals with best Patient Experience for Cleanliness in Texas");
  const untouched = await repair("Show me hospitals with best Patient Experience for Nurse Communication in Ohio");
  check("repair: a correct survey question is never turned into a condition's mortality", untouched?.canonicalQuestion === "Show me hospitals with best Patient Experience for Nurse Communication in Ohio" && untouched?.meta?.repaired === undefined, JSON.stringify(untouched));
  check("repair: the older whole-hospital-metric repair still applies to a condition", (await repair("Show me hospitals with best Safety Performance for Pneumonia"))?.canonicalQuestion === "Show me hospitals with lowest Mortality Rate for Pneumonia");

  // ------------------------------------------------------------------------------------------ 5. Phase 8
  console.log("\n5 - Phase 8: what stays refused, 0 SQL");
  for (const question of [
    "Which hospitals have the highest scores for staff responsiveness?", // B042, no data
    "care transition",
    "hospitals where nurses always listen carefully", // B028, D3 item level
    "hospitals where doctors explain things in a way you can understand", // B032
    "doctors who listen carefully ranking", // B033
  ]) {
    const r = await run(question);
    check(`refused with 0 SQL: "${question}"`, r.success === false && sqlCalls(r) === 0, `success=${r.success} sql=${sqlCalls(r)}`);
  }

  console.log(`\n${"=".repeat(60)}\nRESULT: ${passed} passed, ${failed} failed (${passed + failed} total)\n${"=".repeat(60)}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
