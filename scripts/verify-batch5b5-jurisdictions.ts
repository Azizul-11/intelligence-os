#!/usr/bin/env tsx

/**
 * Batch 5B-5 (jurisdictions: DC and the five US territories) verification. No live model is called: the engine runs
 * with the real pre-check, preprocessor and vocabulary and a stubbed model (`fallback`), against the live warehouse
 * (read-only SELECTs). Every answer is checked against the warehouse's own row counts.
 *
 *   1  registry: STATES, display names, catalog, pre-check, prompt, the uppercase-only codes (D7)
 *   2  the 8 owned catalog rows and the other spellings: every row in the jurisdiction, exact counts
 *   3  Washington: "Washington DC" is DC, "Washington" stays Washington state (no clarification)
 *   4  cities, counties and rankings inside a territory; San Juan County still clarifies
 *   5  negative controls: not a US jurisdiction -> refused, 0 SQL
 *   6  watch: named hospitals, comparisons, the state picker
 *
 * Usage: pnpm exec tsx scripts/verify-batch5b5-jurisdictions.ts
 */
import "dotenv/config";

import type { SqlTemplateDefinition } from "../packages/domain-sdk/src/index";
import { healthcareDomain, DOMAIN_CAPABILITIES } from "../domain-packs/healthcare/src/index";
import { HEALTHCARE_FILLER_WORDS } from "../domain-packs/healthcare/src/runtime/lay-vocabulary";
import { STATES } from "../domain-packs/healthcare/src/runtime/entity-provider";
import { STATE_NAMES_BY_CODE } from "../domain-packs/healthcare/src/runtime/execution-strategy";
import { CITIES } from "../domain-packs/healthcare/src/runtime/geographic-directory";
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
    return await engine.execute({ question });
  } finally {
    console.log = realLog;
  }
}
const sqlCalls = (r: any) => (r.trace ?? []).reduce((sum: number, g: any) => sum + (g.sqlCalls ?? 0), 0);
const allIn = (r: any, code: string) => (r.rows ?? []).length > 0 && (r.rows as any[]).every((row) => row.state === code);

const COUNT: SqlTemplateDefinition = {
  id: "verify-5b5-count",
  name: "verify-5b5-count",
  displayName: "verify",
  description: "verify",
  template: "SELECT COUNT(*) AS n FROM warehouse_hospitals WHERE state = :code",
  type: "aggregation",
  parameters: [{ name: "code", type: "string", required: true, description: "state code" }],
  deterministic: true,
  enabled: true,
};
async function hospitalsIn(code: string): Promise<number> {
  const result = await executor.execute(COUNT, { code });
  return Number((result.rows[0] as any)?.n);
}

const JURISDICTIONS: [string, string][] = [
  ["DC", "District of Columbia"], ["PR", "Puerto Rico"], ["GU", "Guam"], ["VI", "Virgin Islands"], ["AS", "American Samoa"], ["MP", "Northern Mariana Islands"],
];

async function main() {
  // ------------------------------------------------------------------------------------------ 1. registry
  console.log("\n1 - registry, display names, catalog, pre-check, prompt, uppercase-only codes");
  for (const [code, name] of JURISDICTIONS) {
    check(`STATES maps "${name.toLowerCase()}" to ${code}; its display name is "${name}"`, STATES.get(name.toLowerCase()) === code && STATE_NAMES_BY_CODE.get(code) === name, STATE_NAMES_BY_CODE.get(code));
    check(`the catalog's state list names ${name}`, DOMAIN_CAPABILITIES.states.includes(name));
  }
  check("the catalog lists 56 jurisdictions (50 states, DC, 5 territories)", DOMAIN_CAPABILITIES.states.length === 56, String(DOMAIN_CAPABILITIES.states.length));
  for (const spelling of ["washington dc", "washington d c", "d c", "dc", "us virgin islands"]) {
    check(`"${spelling}" is a registered spelling`, STATES.has(spelling));
  }
  check(`"washington" is still Washington state`, STATES.get("washington") === "WA");
  for (const topic of ["dc", "d.c.", "district of columbia"]) {
    check(`"${topic}" is no longer an unsupported topic`, !DOMAIN_CAPABILITIES.unsupportedTopics.includes(topic));
  }
  check("no scope-guidance entry refuses DC any more", !(DOMAIN_CAPABILITIES.scopeGuidance ?? []).some((g) => g.topics.includes("dc")));
  const statesLine = JSON.stringify(DOMAIN_CAPABILITIES.prompts?.catalog?.compact?.states ?? "");
  check("prompt STATES line names DC, Puerto Rico and the territories", statesLine.includes("any US state, DC, Puerto Rico or other US territories"), statesLine);
  for (const [text, expected] of [
    ["hospitals in DC", "hospitals in District of Columbia"],
    ["hospitals in PR", "hospitals in Puerto Rico"],
    ["hospitals in GU", "hospitals in Guam"],
    ["hospitals in Washington DC", "hospitals in Washington District of Columbia"],
  ]) {
    check(`D7: uppercase "${text}" -> "${expected}"`, expandUppercaseStateAbbreviations(text) === expected, expandUppercaseStateAbbreviations(text));
  }
  for (const text of ["hospitals in pr", "hospitals as good as Mayo Clinic", "hospitals in VI", "hospitals in AS", "hospitals in MP", "hospitals in vi"]) {
    check(`D7: "${text}" is left as typed (no code expansion)`, expandUppercaseStateAbbreviations(text) === text, expandUppercaseStateAbbreviations(text));
  }

  // ------------------------------------------------------------------------------------------ 2. owned rows
  console.log("\n2 - owned catalog rows and other spellings: every row in the jurisdiction, exact counts");
  const counts = new Map<string, number>();
  for (const [code] of JURISDICTIONS) {
    counts.set(code, await hospitalsIn(code));
  }
  const OWNED: [string, string, string][] = [
    ["C022", "hospitals in Puerto Rico", "PR"],
    ["C023", "hospitals in Washington DC", "DC"],
    ["C024", "hospitals in Guam", "GU"],
    ["C075", "hospitals in the Virgin Islands", "VI"],
    ["C076", "hospitals in D.C.", "DC"],
    ["C077", "hospitals in American Samoa", "AS"],
    ["C078", "hospitals in the Northern Mariana Islands", "MP"],
    ["V2D052", "hi show me hospitals in Washington DC", "DC"],
    ["-", "HOSPITALS IN WASHINGTON DC", "DC"],
    ["-", "hospitals in Washington, D.C.", "DC"],
    ["-", "hospitals in the District of Columbia", "DC"],
    ["-", "hospitals in DC", "DC"],
    ["-", "hospitals in dc", "DC"],
    ["-", "hospitals in PR", "PR"],
    ["-", "hospitals in the US Virgin Islands", "VI"],
    ["-", "hospitals in the U.S. Virgin Islands", "VI"],
  ];
  for (const [id, question, code] of OWNED) {
    const r = await run(question);
    const expected = Math.min(counts.get(code)!, 100);
    check(`${id} "${question}" -> all ${expected} ${code} hospitals, nothing else`, r.success && allIn(r, code) && r.rows.length === expected && sqlCalls(r) > 0, `success=${r.success} rows=${r.rows?.length} error=${r.error}`);
  }

  // ------------------------------------------------------------------------------------------ 3. Washington
  console.log("\n3 - Washington DC vs Washington state");
  for (const question of ["hospitals in Washington", "hospitals in Washington State", "hospitals in WA", "best hospitals in Washington"]) {
    const r = await run(question);
    check(`"${question}" -> Washington state, no clarification`, r.success && allIn(r, "WA") && r.answerability?.status !== "ambiguous", `success=${r.success} status=${r.answerability?.status}`);
  }
  const bestDc = await run("best hospitals in Washington DC");
  check(`"best hospitals in Washington DC" -> the DC ranking`, bestDc.success && allIn(bestDc, "DC"), bestDc.error);

  // ------------------------------------------------------------------------------------------ 4. inside a territory
  console.log("\n4 - cities, counties and rankings inside a territory");
  const sanJuan = await run("hospitals in San Juan");
  check(`"hospitals in San Juan" (a city only in Puerto Rico) -> Puerto Rico rows`, sanJuan.success && allIn(sanJuan, "PR"), sanJuan.error);
  const sanJuanCounty = await run("hospitals in San Juan County");
  const labels = ((sanJuanCounty.answerability?.candidates ?? []) as any[]).map((c) => c.label).sort().join(",");
  check(`"hospitals in San Juan County" (NM, PR, UT, WA) still clarifies, 0 SQL, Puerto Rico named`,
    sanJuanCounty.answerability?.status === "ambiguous" && sqlCalls(sanJuanCounty) === 0 && labels === "New Mexico,Puerto Rico,Utah,Washington", labels);
  const prCity = [...CITIES.entries()].find(([key, value]) => key !== "san juan" && value.states.length === 1 && value.states[0] === "PR");
  if (prCity) {
    const r = await run(`hospitals in ${prCity[0]}`);
    check(`a Puerto Rico-only city ("${prCity[0]}") derives the territory -> Puerto Rico rows`, r.success && allIn(r, "PR") && r.executedParameters?.state === "PR", `${r.error} state=${r.executedParameters?.state}`);
  }
  const prBest = await run("best hospitals in Puerto Rico");
  check(`"best hospitals in Puerto Rico" -> the 7 rated Puerto Rico hospitals`, prBest.success && allIn(prBest, "PR") && prBest.rows.length === 7, `rows=${prBest.rows?.length}`);
  const prAmi = await run("heart attack death rate in Puerto Rico");
  check(`"heart attack death rate in Puerto Rico" -> MORT_30_AMI, Puerto Rico only`, prAmi.success && allIn(prAmi, "PR") && prAmi.rows[0]?.measure_code === "MORT_30_AMI", prAmi.error);

  // ------------------------------------------------------------------------------------------ 5. negatives
  console.log("\n5 - negative controls: not a US jurisdiction -> refused, 0 SQL");
  for (const question of ["hospitals in Wakanda", "hospitals in Canada", "hospitals in Mexico", "hospitals in DFW", "hospitals in the bay area", "hospitals in London"]) {
    const r = await run(question);
    check(`"${question}" -> refused, 0 SQL`, !r.success && sqlCalls(r) === 0, `success=${r.success} sql=${sqlCalls(r)} rows=${r.rows?.length}`);
  }

  // ------------------------------------------------------------------------------------------ 6. watch
  console.log("\n6 - named hospitals, comparisons, the state picker");
  const guam = await run("Tell me about Guam Memorial Hospital Authority");
  check(`"Tell me about Guam Memorial Hospital Authority" -> that hospital's dossier (a name, not the territory)`, guam.success && guam.rows?.length === 1 && guam.rows[0].state === "GU");
  const compare = await run("Compare Mayo Clinic and Cleveland Clinic");
  check(`"Compare Mayo Clinic and Cleveland Clinic" -> 2 dossiers (Phase 7.5 unchanged)`, compare.success && compare.rows?.length === 2);
  const picker = await run("show me 5 star hospitals");
  const pickerLabels = ((picker.answerability?.candidates ?? []) as any[]).map((c) => c.label);
  check(`the state picker ("5 star hospitals", no place) offers the 56 jurisdictions, 0 SQL`, picker.answerability?.status === "ambiguous" && pickerLabels.length === 56 && pickerLabels.includes("District of Columbia") && sqlCalls(picker) === 0, String(pickerLabels.length));

  console.log(`\nRESULT: ${passed} passed, ${failed} failed (${passed + failed} total)`);
}

main().then(() => process.exit(failed > 0 ? 1 : 0));
