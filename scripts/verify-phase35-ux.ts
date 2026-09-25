#!/usr/bin/env tsx

/**
 * Phase 3.5 (UX hardening: executive summaries and suggestions) verification. No live model is called: the engine runs
 * with the real pre-check, vocabulary and a stubbed model (`fallback`); the suggestion hook is the domain's own
 * deterministic pool (the model only selects and rewords from it), captured with the exact context the engine passes,
 * and the engine's own dry-run validation decides which chips survive - as in production. Warehouse: SELECT-only.
 *
 *   1  summary context: measure and direction, filters, facts, plain rows (no ids, codes or snake_case)
 *   2  grounding: fact numbers accepted, bullets read as sentences, invented names still rejected; notes + bullets layout
 *   3  suggestions: no "Hospital List", direction words, 5B capabilities in the pool, every chip answerable as written
 *   4  clarification options (all 4 San Juan County states), military (DoD) listed with the reason, Phase 8 (0 SQL)
 *
 * Usage: pnpm exec tsx scripts/verify-phase35-ux.ts
 */
import "dotenv/config";

import type { SuggestionContext } from "../packages/domain-sdk/src/index";
import { healthcareDomain, DOMAIN_CAPABILITIES } from "../domain-packs/healthcare/src/index";
import { HEALTHCARE_FILLER_WORDS } from "../domain-packs/healthcare/src/runtime/lay-vocabulary";
import { describeOverallRatingTies } from "../domain-packs/healthcare/src/runtime/ranking-ties";
import { buildSummaryContext, summaryFactNumbers, summaryVocabulary } from "../domain-packs/healthcare/src/runtime/summary-context";
import { buildSuccessSuggestionPool, chipKeepsDirection, generateHealthcareSuggestions } from "../domain-packs/healthcare/src/runtime/suggestion-generator";
import { HEALTHCARE_PROMPT_WORDING } from "../domain-packs/healthcare/src/runtime/prompt-wording";
import { expandUppercaseStateAbbreviations } from "../domain-packs/healthcare/src/runtime/state-abbreviation-preprocessor";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { SqlExecutor } from "../packages/sql-executor/src/sql-executor";
import { SupabaseDatabaseAdapter } from "../packages/sql-executor/src/supabase-database-adapter";
import { normalizeQuestion } from "../supabase/functions/orchestrator/services/normalizer-hook";
import { findUngroundedNames } from "../supabase/functions/orchestrator/services/summary-grounding";
import { composeSummary } from "../supabase/functions/orchestrator/services/graceful-message";
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

// Test-only: the suggestion hook returns the deterministic pool (no model) and records the context the engine passed.
let lastContext: SuggestionContext | undefined;
let lastPool: string[] = [];
const strategy = runtime.domain.executionStrategy as { generateSuggestions?: (context: SuggestionContext) => Promise<string[]> };
strategy.generateSuggestions = async (context: SuggestionContext) => {
  lastContext = context;
  lastPool = context.success ? buildSuccessSuggestionPool(context) : generateHealthcareSuggestions(context);
  return lastPool;
};

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
async function run(question: string, includeSuggestions = true): Promise<any> {
  console.log = () => {};
  try {
    return await engine.execute({ question, includeSuggestions } as any);
  } finally {
    console.log = realLog;
  }
}
async function dryRun(question: string): Promise<boolean> {
  console.log = () => {};
  try {
    return (await engine.execute({ question, dryRun: true } as any)).success === true;
  } finally {
    console.log = realLog;
  }
}
const sqlCalls = (r: any) => (r.trace ?? []).reduce((sum: number, g: any) => sum + (g.sqlCalls ?? 0), 0);
const RAW_KEY = /_/;

async function main() {
  // ------------------------------------------------------------------------------------------ 1. summary context
  console.log("\n1 - summary context");
  const stroke = await run("stroke mortality");
  const strokeContext = buildSummaryContext({ rows: stroke.rows, parameters: stroke.executedParameters });
  check("stroke mortality -> a ranking; lower is better; percent", strokeContext.kind === "ranking" && strokeContext.measure?.better === "lower" && strokeContext.measure.unit === "percent", JSON.stringify(strokeContext.measure));
  check("stroke mortality -> facts: leader (title-cased), best and last shown, how many beat the national rate",
    (strokeContext.facts.leader as any)?.hospital === "NYU Langone Hospitals" && strokeContext.facts.bestShown === 8.1 && typeof strokeContext.facts.betterThanNational === "number",
    JSON.stringify(strokeContext.facts));
  check("stroke mortality -> rows carry plain labels only (no facility_id, measure_code or snake_case key)",
    strokeContext.rows.length === 10 && strokeContext.rows.every((row) => Object.keys(row).every((key) => !RAW_KEY.test(key))) && "Hospital" in strokeContext.rows[0]!,
    JSON.stringify(strokeContext.rows[0]));

  const clean = await run("cleanest hospitals");
  const cleanContext = buildSummaryContext({ rows: clean.rows, parameters: clean.executedParameters });
  check("cleanest hospitals -> a survey measure, higher is better, points out of 100", cleanContext.measure?.better === "higher" && /Cleanliness/.test(cleanContext.measure?.name ?? "") && cleanContext.measure?.unit === "points out of 100", JSON.stringify(cleanContext.measure));
  check("cleanest hospitals -> ties on the top value are a fact (no need to list them)", typeof cleanContext.facts.hospitalsSharingTheTopValue === "number" || cleanContext.facts.bestShown !== cleanContext.facts.lastShown, JSON.stringify(cleanContext.facts));

  const dc = await run("hospitals in Washington DC");
  const dcContext = buildSummaryContext({ rows: dc.rows, parameters: dc.executedParameters });
  check("hospitals in Washington DC -> a list of 10, not ranked, filter 'District of Columbia'", dcContext.kind === "list" && dcContext.facts.hospitalsShown === 10 && dcContext.filters.includes("District of Columbia") && !dcContext.measure, JSON.stringify({ kind: dcContext.kind, filters: dcContext.filters }));

  const birthing = await run("birthing friendly hospitals in Texas");
  const birthingContext = buildSummaryContext({ rows: birthing.rows, parameters: birthing.executedParameters });
  check("birthing friendly hospitals in Texas -> the filters name the designation and the state", birthingContext.filters.includes("CMS Birthing-Friendly designation") && birthingContext.filters.includes("Texas"), JSON.stringify(birthingContext.filters));

  const numbers = summaryFactNumbers(strokeContext);
  check("fact numbers include the counts and the range the model may state", numbers.includes("10") && numbers.includes("8.1") && numbers.includes(String(strokeContext.facts.lastShown)), JSON.stringify(numbers));

  const prompt = HEALTHCARE_PROMPT_WORDING.summary!.join(" ");
  check("summary prompt: up to 3 bullet lines, leader / pattern / context, facts-only numbers, no repetition", /2 or 3 bullet lines/.test(prompt) && /facts\.leader/.test(prompt) && /never compute a new number/.test(prompt) && /group them/.test(prompt));

  // ------------------------------------------------------------------------------------------ 2. grounding
  console.log("\n2 - grounding and layout");
  const bullets = "• NYU Langone Hospitals in New York leads with a stroke death rate of 8.1 percent, where lower is better.\n• Across the 10 hospitals shown, rates run from 8.1 to 9.5, and all 10 are better than the national rate.\n• Only New York and Illinois appear more than once.";
  const ungrounded = findUngroundedNames(bullets, "stroke mortality", stroke.rows, [...DOMAIN_CAPABILITIES.states, ...summaryVocabulary(strokeContext)]);
  check("a bullet summary built from the facts is grounded (bullets start sentences: 'Across', 'Only')", ungrounded.length === 0, JSON.stringify(ungrounded));
  const invented = findUngroundedNames("• Mercy General Hospital leads with 8.1.", "stroke mortality", stroke.rows, summaryVocabulary(strokeContext));
  check("an invented hospital name in a bullet is still rejected", JSON.stringify(invented) === JSON.stringify(["Mercy General Hospital"]), JSON.stringify(invented));
  const composed = composeSummary("19 hospitals in this search hold a 5-star overall rating", "• First line.\n• Second line.");
  check("notes stay one paragraph, each bullet on its own line", composed === "19 hospitals in this search hold a 5-star overall rating.\n• First line.\n• Second line.", JSON.stringify(composed));
  const legacy = composeSummary("Read 'x' as y", "A plain sentence.");
  check("a summary without bullets is joined as before", legacy === "Read 'x' as y. A plain sentence.", JSON.stringify(legacy));

  // ------------------------------------------------------------------------------------------ 3. suggestions
  console.log("\n3 - suggestions");
  const scenarios: [string, (pool: string[]) => boolean, string][] = [
    ["hospitals in Washington DC", (pool) => !pool.some((chip) => /Hospital List/.test(chip)), "no 'Hospital List' chip"],
    ["hospitals in Puerto Rico", (pool) => !pool.some((chip) => /Hospital List/.test(chip)), "no 'Hospital List' chip"],
    ["stroke mortality", (pool) => pool.some((chip) => /\bAMI\b|Heart Attack/i.test(chip)) && pool.some((chip) => /Sepsis/i.test(chip)), "siblings: heart attack and sepsis"],
    ["cleanest hospitals", (pool) => pool.filter((chip) => /Quietness|Nurse Communication|Doctor Communication|Recommend/i.test(chip)).length >= 2, "other survey dimensions"],
    ["best hospitals in Texas", (pool) => pool.some((chip) => /Stroke|Hospital-Wide|Sepsis|Cleanliness|Quietness/i.test(chip)), "5B measures offered to a condition-less answer"],
    ["best hospitals in Texas", (pool) => pool.some((chip) => /church-owned|physician-owned|government/.test(chip)), "ownership sub-labels"],
    ["best hospitals in Texas", (pool) => pool.some((chip) => /emergency services|birthing-friendly|critical access/.test(chip)), "types and flags"],
    ["best hospitals in Maryland", (pool) => pool.some((chip) => /District of Columbia/.test(chip)), "DC as Maryland's neighbour"],
    ["best hospitals", (pool) => pool.some((chip) => /Puerto Rico|District of Columbia/.test(chip)), "a jurisdiction chip on a nationwide answer"],
    ["heart attack death rate in Ohio", (pool) => pool.every((chip) => !/best Mortality Rate|best Readmission Rate/.test(chip)), "direction words: lowest Mortality / Readmission"],
    ["stroke mortality", (pool) => !pool.some((chip) => /Hip\/Knee mortality/i.test(chip)) && pool.some((chip) => /hip and knee replacement complication rate/.test(chip)), "hip/knee is offered as its complication rate, never a 'mortality rate'"],
    ["military hospitals", (pool) => /^Show me veterans hospitals/.test(pool[0] ?? ""), "a military list leads with veterans hospitals"],
  ];
  for (const [question, test, label] of scenarios) {
    const r = await run(question);
    check(`"${question}" -> ${label}`, r.success && test(lastPool), JSON.stringify(lastPool.slice(0, 12)));
  }

  // Every chip a pool offers is answerable exactly as written, or the engine drops it before it is shown.
  for (const question of ["stroke mortality", "cleanest hospitals", "hospitals in Washington DC", "best hospitals in Texas", "military hospitals"]) {
    const r = await run(question);
    const shown = (r.suggestions ?? []) as string[];
    const allAnswerable = (await Promise.all(shown.map(dryRun))).every(Boolean);
    check(`"${question}" -> 3 chips shown, each answerable exactly as written, each keeps its direction`, shown.length === 3 && allAnswerable && shown.every(chipKeepsDirection), JSON.stringify(shown));
  }
  let conceptChipsOk = true;
  const broken: string[] = [];
  for (const question of ["stroke mortality", "cleanest hospitals", "pressure ulcer rate", "best hospitals in Texas"]) {
    await run(question, true);
    for (const chip of lastPool.filter((c) => /Show me hospitals with (lowest|best) /.test(c))) {
      if (!(await dryRun(chip))) {
        conceptChipsOk = false;
        broken.push(chip);
      }
    }
  }
  check("every measure / concept chip the pools build is answerable as written (no chip is dropped as broken)", conceptChipsOk, JSON.stringify(broken));

  check("direction guard: 'highest Mortality Rate' and 'lowest Cleanliness' are rejected; the good end is kept",
    !chipKeepsDirection("Which hospitals in Ohio have the highest Mortality Rate?") && !chipKeepsDirection("Show me hospitals with lowest Cleanliness score") &&
      chipKeepsDirection("Which hospitals have the lowest AMI mortality rates?") && chipKeepsDirection("Show me hospitals with best Cleanliness score") &&
      chipKeepsDirection("Hospitals with the fewest pressure ulcers"));
  check("parity: a chip with a word the pipeline does not understand fails its dry run (it would go to the model on click)",
    (await dryRun("Show me hospitals with best Hospital Overall Rating near the beach")) === false && (await dryRun("Show me hospitals with best Hospital Overall Rating")) === true);

  // ------------------------------------------------------------------------------------------ 4. clarification, D11, Phase 8
  console.log("\n4 - clarification options, military, Phase 8");
  const sanJuan = await run("hospitals in San Juan County");
  check(`"hospitals in San Juan County" -> all 4 states offered as options, 0 SQL`,
    sanJuan.answerability?.status === "ambiguous" && JSON.stringify([...(sanJuan.suggestions ?? [])].sort()) === JSON.stringify(["New Mexico", "Puerto Rico", "Utah", "Washington"]) && sqlCalls(sanJuan) === 0,
    JSON.stringify(sanJuan.suggestions));
  const memorial = await run("Tell me about Memorial Hospital");
  check(`a hospital clarification offers every candidate (Memorial Hospital: ${memorial.answerability?.candidates?.length} candidates), 0 SQL`,
    memorial.answerability?.status === "ambiguous" && (memorial.suggestions ?? []).length === memorial.answerability?.candidates?.length && sqlCalls(memorial) === 0,
    `${memorial.suggestions?.length} of ${memorial.answerability?.candidates?.length}`);

  const military = await run("military hospitals");
  const note = await describeOverallRatingTies({ rows: military.rows ?? [], parameters: military.executedParameters, run: (t, p) => executor.execute(t, p) });
  check(`"military hospitals" -> the 32 Department of Defense hospitals listed (not an empty ranking)`, military.success && military.rows?.length === 32 && military.rows.every((row: any) => /^Department of Defense/.test(row.ownership)), `rows=${military.rows?.length}`);
  check(`"military hospitals" -> the reason is disclosed`, typeof note === "string" && note.startsWith("CMS does not calculate clinical mortality, safety or overall star ratings for military (Department of Defense) hospitals"), String(note));
  check(`"military hospitals" -> chips are not the generic triple; veterans hospitals are offered`, lastPool.some((chip) => /veterans hospitals/.test(chip)) && !lastPool.includes("Tell me about Mayo Clinic"), JSON.stringify(lastPool.slice(0, 8)));
  const militaryVa = await run("military hospitals in Virginia");
  check(`"military hospitals in Virginia" -> its 2 DoD hospitals listed`, militaryVa.success && militaryVa.rows?.length === 2, `rows=${militaryVa.rows?.length}`);
  const tribal = await run("tribal hospitals");
  check(`"tribal hospitals" (partly rated) -> still a ranking, unchanged`, tribal.success && tribal.rows?.length === 2 && tribal.rows.every((row: any) => row.overall_rating !== null), `rows=${tribal.rows?.length}`);

  for (const q of ["hospitals with the best communication", "emergency room wait times", "sepsis mortality"]) {
    const r = await run(q);
    check(`"${q}" -> not answered, 0 SQL (Phase 8)`, !r.success && sqlCalls(r) === 0, `sql=${sqlCalls(r)}`);
  }
  check("the suggestion context the engine passes carries the plan (used by the pool)", lastContext?.executionPlan !== undefined || lastContext?.success === false);

  console.log(`\nRESULT: ${passed} passed, ${failed} failed (${passed + failed} total)`);
}

main().then(() => process.exit(failed > 0 ? 1 : 0));
