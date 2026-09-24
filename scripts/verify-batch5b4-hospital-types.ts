#!/usr/bin/env tsx

/**
 * Batch 5B-4 (hospital types, emergency-services and birthing-friendly flags, D4 clarification chips, "facilities")
 * verification. No live model is called: the engine runs with the real pre-check and lay vocabulary and a stubbed model
 * (`fallback`), against the live warehouse (read-only SELECTs). Every filtered answer is checked row by row against
 * the warehouse's own columns.
 *
 *   1  registry, directory, templates and prompt
 *   2  the owned catalog rows (D001-D006, D015, D075-D077, V2D060, V2E017, E069): only matching rows
 *   3  D11: unrated types are listed with the reason; nationwide lists say how many matched
 *   4  the silent-drop guard, name precedence, comparisons and listings unchanged
 *   5  Task 1: the "which communication?" chips, bare "nurse" / "doctor" / "medicine", "facilities"
 *   6  what stays refused (emergency-room waits), 0 SQL
 *
 * Usage: pnpm exec tsx scripts/verify-batch5b4-hospital-types.ts
 */
import "dotenv/config";

import type { SqlTemplateDefinition } from "../packages/domain-sdk/src/index";
import { healthcareDomain, DOMAIN_CAPABILITIES } from "../domain-packs/healthcare/src/index";
import { HEALTHCARE_FILLER_WORDS, clarificationChips } from "../domain-packs/healthcare/src/runtime/lay-vocabulary";
import { describeOverallRatingTies } from "../domain-packs/healthcare/src/runtime/ranking-ties";
import { HOSPITAL_TYPES } from "../domain-packs/healthcare/src/runtime/hospital-attribute-directory";
import { healthcareSqlTemplates } from "../domain-packs/healthcare/src/sql/index";
import { expandUppercaseStateAbbreviations } from "../domain-packs/healthcare/src/runtime/state-abbreviation-preprocessor";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { SqlExecutor } from "../packages/sql-executor/src/sql-executor";
import { SupabaseDatabaseAdapter } from "../packages/sql-executor/src/supabase-database-adapter";
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

const runtime = createDomainRuntime(healthcareDomain);
const executor = new SqlExecutor(new SupabaseDatabaseAdapter(createClient(env.supabaseUrl, env.supabaseServiceRoleKey)));
const engine = createRuntimeEngine({
  runtime,
  semantic: createSemanticResolver(runtime.registry, runtime.entityProvider),
  planner: new QueryPlanner({ fillerWords: HEALTHCARE_FILLER_WORDS }),
  executionPlanMapper: new ExecutionPlanMapper(),
  executor,
  preprocessQuestion: expandUppercaseStateAbbreviations,
  llmFallback: (q: string) => normalizeQuestion(q, DOMAIN_CAPABILITIES, async () => ({ status: "fallback" })),
});
const realLog = console.log;
async function run(question: string): Promise<any> {
  console.log = () => {};
  try {
    return await engine.execute({ question, includeSuggestions: true } as any);
  } finally {
    console.log = realLog;
  }
}
const sqlCalls = (r: any) => (r.trace ?? []).reduce((sum: number, g: any) => sum + (g.sqlCalls ?? 0), 0);
const llmGate = (r: any) => [...(r.trace ?? [])].reverse().find((g: any) => g.phase === "llm-normalization" && g.status !== "enter");
const noteOf = async (r: any) =>
  r.success && r.rows?.length ? describeOverallRatingTies({ rows: r.rows, parameters: r.executedParameters, run: (t, p) => executor.execute(t, p) }) : undefined;

/** Read-only probe of the warehouse's own attribute columns, for row-by-row checks (not a registered template). */
const ATTRIBUTES: SqlTemplateDefinition = {
  id: "verify-5b4-attributes",
  name: "verify-5b4-attributes",
  displayName: "verify",
  description: "verify",
  template: "SELECT facility_id, hospital_type, emergency_services, birthing_friendly, ownership, overall_rating, state FROM warehouse_hospitals WHERE facility_id IN (:ids)",
  type: "lookup",
  parameters: [{ name: "ids", type: "array", required: true, description: "facility ids" }],
  deterministic: true,
  enabled: true,
};
async function attributesOf(rows: any[]): Promise<any[]> {
  const result = await executor.execute(ATTRIBUTES, { ids: rows.map((row) => String(row.facility_id)) });
  return result.rows as any[];
}
const COUNT: SqlTemplateDefinition = { ...ATTRIBUTES, id: "verify-5b4-count", template: "SELECT COUNT(*) AS n FROM warehouse_hospitals WHERE :where", parameters: [] };
async function countWhere(where: string): Promise<number> {
  const result = await executor.execute({ ...COUNT, template: COUNT.template.replace(":where", where) }, {});
  return Number((result.rows[0] as any)?.n);
}

async function main() {
  // ------------------------------------------------------------------------------------------ 1. registry and prompt
  console.log("\n1 - registry, directory, templates and prompt");
  for (const [id, parameter] of [["hospital-type", "hospitalType"], ["emergency-services", "emergencyServices"], ["birthing-friendly", "birthingFriendly"]]) {
    const entity = runtime.domain.entities.find((e: any) => e.id === id) as any;
    check(`entity "${id}" is registered with parameter :${parameter}`, entity?.execution?.parameter === parameter);
  }
  const provider = runtime.entityProvider;
  for (const [phrase, entityId, value] of [
    ["childrens", "hospital-type", "Childrens"], ["children's", "hospital-type", "Childrens"], ["psychiatric", "hospital-type", "Psychiatric"],
    ["critical access", "hospital-type", "Critical Access Hospitals"], ["acute care", "hospital-type", "Acute Care Hospitals"],
    ["rural emergency", "hospital-type", "Rural Emergency Hospital"], ["emergency services", "emergency-services", "true"],
    ["birthing friendly", "birthing-friendly", "Y"], ["birthing-friendly", "birthing-friendly", "Y"],
  ]) {
    const resolved = provider.resolve(phrase) as any;
    check(`"${phrase}" resolves to ${entityId} = ${value}`, resolved.found && resolved.entityId === entityId && resolved.value === value, JSON.stringify(resolved));
  }
  const exactName = provider.resolve("childrens hospital") as any;
  check(`precedence: "childrens hospital" (an exact hospital name) stays a hospital, never a type`, exactName.entityId === "hospital", JSON.stringify(exactName));
  check("the directory registers exactly the 5 briefed types", new Set([...HOSPITAL_TYPES.values()].map((t) => t.likePattern)).size === 5);
  for (const topic of ["emergency services", "birthing friendly", "birthing-friendly", "hospital type", "acute care", "critical access", "childrens", "children's", "psychiatric", "rural emergency"]) {
    check(`"${topic}" is no longer an unsupported topic`, !DOMAIN_CAPABILITIES.unsupportedTopics.includes(topic));
  }
  for (const topic of ["ed wait", "er wait", "ed waits", "er waits", "wait time", "wait times", "emergency department"]) {
    check(`"${topic}" stays an unsupported topic`, DOMAIN_CAPABILITIES.unsupportedTopics.includes(topic));
  }
  for (const id of ["hospital-list-by-state", "hospital-overall-rating-ranking", "hospital-condition-mortality-ranking", "hospital-condition-safety-indicator-ranking", "hospital-list-nationwide"]) {
    const template = healthcareSqlTemplates.find((t) => t.id === id)!;
    const names = (template.parameters ?? []).map((p) => p.name);
    check(`${id} declares :hospitalType, :emergencyServices and :birthingFriendly (NULL-guarded)`,
      ["hospitalType", "emergencyServices", "birthingFriendly"].every((n) => names.includes(n) && template.template.includes(`:${n} IS NULL OR`)));
  }
  const nationwide = healthcareSqlTemplates.find((t) => t.id === "hospital-list-nationwide")!;
  check("hospital-list-nationwide never runs unfiltered and returns at most 100 rows",
    nationwide.template.includes(":hospitalType IS NOT NULL OR :emergencyServices IS NOT NULL OR :birthingFriendly IS NOT NULL") && /LIMIT 100/.test(nationwide.template));
  check("hospital-detail projects birthing_friendly", /birthing_friendly/.test(healthcareSqlTemplates.find((t) => t.id === "hospital-detail")!.template));
  const rules = DOMAIN_CAPABILITIES.prompts?.normalizer?.rules.join("\n") ?? "";
  check("prompt: RULE 3(f) names the hospital types and flags", rules.includes("(f) HOSPITAL TYPES (acute care, critical access, children's, psychiatric, rural emergency) and FLAGS (emergency services, birthing-friendly)"));
  check("prompt: RULE 1 keeps a hospital type or flag", rules.includes("a hospital type or flag stays"));
  check("prompt: RULE 6 no longer reports hospital type or emergency services as unsupported", !rules.includes("(hospital type, emergency services") && rules.includes("HOSPITAL TYPES, FLAGS, OWNERSHIPS"));

  // ------------------------------------------------------------------------------------------ 2. owned rows
  console.log("\n2 - owned catalog rows: only matching rows");
  const OWNED: { id: string; q: string; where: (a: any) => boolean; state?: string; minRows?: number }[] = [
    { id: "D001", q: "birthing friendly hospitals in Texas", where: (a) => a.birthing_friendly === "Y", state: "TX" },
    { id: "D002", q: "hospitals with emergency services in Ohio", where: (a) => a.emergency_services === true, state: "OH" },
    { id: "D003", q: "childrens hospitals in California", where: (a) => a.hospital_type === "Childrens", state: "CA" },
    { id: "D004", q: "psychiatric hospitals in Florida", where: (a) => a.hospital_type === "Psychiatric", state: "FL" },
    { id: "D005", q: "critical access hospitals in Kansas", where: (a) => a.hospital_type === "Critical Access Hospitals", state: "KS" },
    { id: "D006", q: "rural emergency hospitals", where: (a) => a.hospital_type === "Rural Emergency Hospital", minRows: 41 },
    { id: "D075", q: "Show me acute care hospitals in Ohio.", where: (a) => a.hospital_type === "Acute Care Hospitals", state: "OH" },
    { id: "D076", q: "Which hospitals offer emergency services?", where: (a) => a.emergency_services === true },
    { id: "D077", q: "Show me hospitals in Texas that provide emergency services", where: (a) => a.emergency_services === true, state: "TX" },
    { id: "V2D060", q: "birthing-friendly hospitals in Ohio", where: (a) => a.birthing_friendly === "Y", state: "OH" },
    { id: "V2E017", q: "childrens hospitals in Ohio", where: (a) => a.hospital_type === "Childrens", state: "OH" },
    // D015 as written ("... in Ohio with 5 stars") reaches the model ("with" after the place); this is the canonical
    // form the prompt's RULE 3(d)/(f) produce, answered deterministically with all four filters.
    {
      id: "D015",
      q: "Show me 5-star government acute care hospitals in Ohio",
      where: (a) => a.hospital_type === "Acute Care Hospitals" && /^Government/.test(a.ownership) && String(a.overall_rating) === "5",
      state: "OH",
    },
  ];
  for (const row of OWNED) {
    const r = await run(row.q);
    const rows = (r.rows ?? []) as any[];
    const attributes = rows.length ? await attributesOf(rows) : [];
    const allMatch = attributes.length === rows.length && attributes.every(row.where);
    const inState = !row.state || attributes.every((a) => a.state === row.state);
    check(`${row.id} "${row.q}" -> ${rows.length} rows, every one matches the filter${row.state ? ` and is in ${row.state}` : ""}`,
      r.success && rows.length >= (row.minRows ?? 1) && allMatch && inState && sqlCalls(r) > 0,
      `success=${r.success} rows=${rows.length} match=${allMatch} inState=${inState} error=${r.error}`);
  }
  const e069 = await run("Is Mayo Clinic a birthing-friendly hospital?");
  check(`E069 "Is Mayo Clinic a birthing-friendly hospital?" -> the dossier, with birthing_friendly answered (Y/N)`,
    e069.success && e069.rows?.length === 1 && ["Y", "N"].includes(e069.rows[0].birthing_friendly), JSON.stringify(e069.rows?.[0] ?? e069.error).slice(0, 200));
  const d015Count = await countWhere("hospital_type = 'Acute Care Hospitals' AND ownership LIKE 'Government%' AND overall_rating = '5' AND state = 'OH'");
  const d015 = await run("Show me 5-star government acute care hospitals in Ohio");
  check(`D015: the four filters together return exactly the warehouse's ${d015Count} hospital(s)`, d015.rows?.length === d015Count, `rows=${d015.rows?.length}`);

  // ------------------------------------------------------------------------------------------ 3. D11
  console.log("\n3 - D11: unrated types are listed, not ranked, and the answer says why");
  for (const [q, type, label] of [
    ["psychiatric hospitals in Florida", "Psychiatric", "psychiatric"],
    ["childrens hospitals in California", "Childrens", "children's"],
    ["rural emergency hospitals", "Rural Emergency Hospital", "rural emergency"],
    ["Show me children's hospitals with best Hospital Overall Rating in Ohio", "Childrens", "children's"],
    ["Show me psychiatric hospitals with lowest Mortality Rate for Heart Failure in Florida", "Psychiatric", "psychiatric"],
  ]) {
    const r = await run(q);
    const note = await noteOf(r);
    check(`"${q}" -> the ${type} list (not an empty ranking) with the CMS note`,
      r.success && r.rows.length > 0 && r.rows.every((row: any) => row.hospital_type === type) && typeof note === "string" && note.startsWith(`CMS does not calculate clinical mortality, safety or overall star ratings for ${label} hospitals`),
      `rows=${r.rows?.length} note=${note} error=${r.error}`);
  }
  // The model keeps the type in the vague-ask shape ("Show me best children's hospitals", seen live); the canonical
  // repair turns it into the ranking shape the planner answers.
  for (const [asked, rewrite, check5] of [
    ["best childrens hospitals", "Show me best children's hospitals", (rows: any[]) => rows.length > 0 && rows.every((row) => row.hospital_type === "Childrens")],
    ["top emergency services hospitals in Ohio", "Show me top emergency services hospitals in Ohio", (rows: any[]) => rows.length === 10 && rows.every((row) => row.state === "OH")],
  ] as const) {
    const scripted = createRuntimeEngine({
      runtime,
      semantic: createSemanticResolver(runtime.registry, runtime.entityProvider),
      planner: new QueryPlanner({ fillerWords: HEALTHCARE_FILLER_WORDS }),
      executionPlanMapper: new ExecutionPlanMapper(),
      executor,
      preprocessQuestion: expandUppercaseStateAbbreviations,
      llmFallback: (q: string) => normalizeQuestion(q, DOMAIN_CAPABILITIES, async () => ({ status: "ok", canonical_question: rewrite })),
    });
    console.log = () => {};
    const r: any = await scripted.execute({ question: asked }).finally(() => (console.log = realLog));
    const gate = llmGate(r);
    check(`repair: the model's "${rewrite}" -> the overall-rating shape, answered (${asked})`,
      r.success && check5(r.rows ?? []) && /hospitals with (best|top) Hospital Overall Rating/.test(String(gate?.detail?.canonicalQuestion ?? "")),
      `${r.error} ${JSON.stringify(gate?.detail).slice(0, 200)}`);
  }
  const psychiatricTotal = await countWhere("hospital_type = 'Psychiatric'");
  const nationwidePsych = await run("psychiatric hospitals");
  const nationwideNote = await noteOf(nationwidePsych);
  check(`"psychiatric hospitals" (no place) -> the first 100 of ${psychiatricTotal}, and the note says so`,
    nationwidePsych.rows?.length === 100 && typeof nationwideNote === "string" && nationwideNote.includes(`${psychiatricTotal.toLocaleString("en-US")} hospitals match nationwide, displaying the first 100 alphabetically`),
    `rows=${nationwidePsych.rows?.length} note=${nationwideNote}`);
  const acuteOhio = await run("Show me acute care hospitals in Ohio.");
  const acuteTie = await noteOf(acuteOhio);
  const acuteFive = await countWhere("hospital_type = 'Acute Care Hospitals' AND overall_rating = '5' AND state = 'OH'");
  check(`a rated type is ranked; its tie note counts that type only (${acuteFive} 5-star acute care hospitals in Ohio)`,
    acuteTie === undefined ? acuteFive <= (acuteOhio.rows?.length ?? 0) : acuteTie.startsWith(`${acuteFive} hospitals in this search hold a 5-star`), `note=${acuteTie}`);

  // ------------------------------------------------------------------------------------------ 4. guard, precedence, watch
  console.log("\n4 - the silent-drop guard, name precedence, comparisons and listings");
  const dropped = await run("acute care hospitals with best patient experience in Ohio");
  check(`a template without the type parameter refuses (0 SQL), never drops the filter; alternatives honour it`,
    !dropped.success && sqlCalls(dropped) === 0 && (dropped.answerability?.alternatives ?? []).every((a: any) => a.capabilityId === "hospital-overall-rating"),
    `${dropped.error} ${JSON.stringify(dropped.answerability)}`);
  const cahMortality = await run("critical access hospitals with lowest heart attack mortality in Kansas");
  const cahAttributes = cahMortality.rows?.length ? await attributesOf(cahMortality.rows) : [];
  check(`the condition-mortality template carries the type filter (critical access heart attack mortality in Kansas)`,
    cahMortality.success && cahMortality.rows[0]?.measure_code === "MORT_30_AMI" && cahAttributes.every((a) => a.hospital_type === "Critical Access Hospitals" && a.state === "KS"));
  const psiBirthing = await run("birthing friendly hospitals with lowest pressure ulcer rate in Texas");
  const psiAttributes = psiBirthing.rows?.length ? await attributesOf(psiBirthing.rows) : [];
  check(`the safety-indicator template carries the flag (birthing-friendly pressure ulcer in Texas)`,
    psiBirthing.success && psiBirthing.rows[0]?.measure_code === "PSI_03" && psiAttributes.every((a) => a.birthing_friendly === "Y" && a.state === "TX"));
  const chop = await run("Tell me about Children's Hospital of Philadelphia");
  check(`"Tell me about Children's Hospital of Philadelphia" is still that hospital's dossier`,
    chop.success && chop.rows?.length === 1 && chop.rows[0].hospital_name === "CHILDREN'S HOSPITAL OF PHILADELPHIA", JSON.stringify(chop.rows?.[0]?.hospital_name ?? chop.error));
  const capital = await run("Tell me about Capital District Psych Center");
  check(`"Tell me about Capital District Psych Center" is still that hospital's dossier`,
    capital.success && capital.rows?.length === 1 && capital.rows[0].hospital_name === "CAPITAL DISTRICT PSYCH CENTER");
  const compare = await run("Compare Mayo Clinic and Cleveland Clinic");
  check(`"Compare Mayo Clinic and Cleveland Clinic" -> 2 dossiers (Phase 7.5 unchanged)`, compare.success && compare.rows?.length === 2);
  const texas = await run("hospitals in Texas");
  check(`"hospitals in Texas" -> the plain 100-row list (no type filter)`, texas.success && texas.rows?.length === 100 && texas.executedParameters?.hospitalType === undefined);
  const nonProfit = await run("non-profit hospitals in Ohio");
  check(`"non-profit hospitals in Ohio" -> the overall-rating ranking, unchanged`, nonProfit.success && nonProfit.rows?.length === 10 && nonProfit.executedParameters?.ownership === "Voluntary non-profit%");

  // ------------------------------------------------------------------------------------------ 5. Task 1
  console.log("\n5 - Task 1: clarification chips, short replies, \"facilities\"");
  const b045 = await run("hospitals with the best communication");
  const CHOICES = ["Nurse communication scores", "Doctor communication scores", "Communication about medicines scores"];
  check(`B045 -> 0 SQL, and its chips are exactly the three communication choices`, sqlCalls(b045) === 0 && JSON.stringify(b045.suggestions) === JSON.stringify(CHOICES), JSON.stringify(b045.suggestions));
  check(`a question that names the communication gets no clarification chips`, clarificationChips("best nurse communication") === undefined && clarificationChips("doctors who communicate") === undefined);
  for (const [chip, code] of [[CHOICES[0], "H_COMP_1_LINEAR_SCORE"], [CHOICES[1], "H_COMP_2_LINEAR_SCORE"], [CHOICES[2], "H_COMP_5_LINEAR_SCORE"]] as const) {
    const r = await run(chip);
    check(`chip "${chip}" answers deterministically (no model) -> ${code}`, r.success && r.rows?.[0]?.measure_code === code && !llmGate(r), `${r.rows?.[0]?.measure_code} ${r.error}`);
  }
  for (const [reply, code, heard] of [["nurse", "H_COMP_1_LINEAR_SCORE", "nurse"], ["Nurse", "H_COMP_1_LINEAR_SCORE", "nurse"], ["doctor", "H_COMP_2_LINEAR_SCORE", "doctor"], ["medicine", "H_COMP_5_LINEAR_SCORE", "medicine"]] as const) {
    const r = await run(reply);
    const gate = llmGate(r);
    check(`bare reply "${reply}" -> ${code}, with the reading note`, r.success && r.rows?.[0]?.measure_code === code && gate?.detail?.source === "lay-vocabulary" && String(gate?.detail?.interpretation ?? "").toLowerCase().includes(`'${heard}'`), `${r.rows?.[0]?.measure_code} ${JSON.stringify(gate?.detail)}`);
  }
  const facilities = await run("highest Cleanliness scores among non-profit facilities");
  check(`"highest Cleanliness scores among non-profit facilities" -> Cleanliness for non-profit hospitals, not refused on "facilities"`,
    facilities.success && facilities.rows?.[0]?.measure_code === "H_CLEAN_LINEAR_SCORE" && facilities.executedParameters?.ownership === "Voluntary non-profit%", facilities.error);

  // ------------------------------------------------------------------------------------------ 6. still refused
  console.log("\n6 - emergency-room waits stay refused, 0 SQL");
  for (const q of ["emergency room wait times", "ER wait times in Texas", "ED waits in Texas", "hospitals with the shortest ER wait"]) {
    const r = await run(q);
    check(`"${q}" -> refused, 0 SQL`, !r.success && sqlCalls(r) === 0, `success=${r.success} sql=${sqlCalls(r)}`);
  }

  console.log(`\nRESULT: ${passed} passed, ${failed} failed (${passed + failed} total)`);
}

main().then(() => process.exit(failed > 0 ? 1 : 0));
