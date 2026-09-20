#!/usr/bin/env tsx

/**
 * Batch 4 (ambiguity, identity and continuation) verification. No LLM is called: the engine runs with the LLM front
 * door off, against the live warehouse (read-only SELECTs). Every refusal / clarification asserts SQL = 0.
 *
 *   4.1  named hospitals: health-system families, DBA trade names, "hospital not found" for a contradicting place
 *   4.2  Turn 2: "CITY, ST" and two-option replies, engine side of a two-slot comparison
 *   4.3  star-rating filter without a state, ranking idioms, follow-up / zero-limit pre-flight
 *
 * Usage: pnpm exec tsx scripts/verify-batch4-ambiguity.ts
 */
import "dotenv/config";

import { preflightClarification } from "../supabase/functions/orchestrator/services/conversational";
import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { HOSPITAL_FAMILIES } from "../domain-packs/healthcare/src/runtime/hospital-family-directory";
import { hospitalIdentityDirectory } from "../domain-packs/healthcare/src/runtime/hospital-identity-directory";
import { COUNTIES, CITIES } from "../domain-packs/healthcare/src/runtime/geographic-directory";
import { STATES, normalizeText } from "../domain-packs/healthcare/src/runtime/entity-provider";
import { expandUppercaseStateAbbreviations } from "../domain-packs/healthcare/src/runtime/state-abbreviation-preprocessor";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { matchClarificationPair, matchClarificationResponse } from "../packages/runtime-engine/src/continuation/match-clarification";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { SqlExecutor } from "../packages/sql-executor/src/sql-executor";
import { SupabaseDatabaseAdapter } from "../packages/sql-executor/src/supabase-database-adapter";
import { createClient } from "@supabase/supabase-js";
import { env } from "./shared/env";

// Deterministic run: the LLM front door stays off (no llmFallback is wired either).
delete process.env.LLM_FIRST_FRONT_DOOR_ENABLED;

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
const provider = runtime.entityProvider as unknown as { resolve: (phrase: string) => any };
const planner = new QueryPlanner();
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);

// ------------------------------------------------------------------------------------------ 4.1 family directory data
console.log("\n4.1 - hospital-family directory data");

for (const family of HOSPITAL_FAMILIES) {
  const members = hospitalIdentityDirectory.filter((record) => normalizeText(record.hospitalName).startsWith(`${family} `));
  check(`family "${family}" prefixes at least two official names (${members.length})`, members.length >= 2);
  check(
    `family "${family}" is not a state, city or county`,
    !STATES.has(family) && !CITIES.has(family) && !COUNTIES.has(family),
  );
  check(`family "${family}" is not itself an official name`, !hospitalIdentityDirectory.some((r) => normalizeText(r.hospitalName) === family));
}

// ------------------------------------------------------------------------------------------ 4.1 entity provider
console.log("\n4.1 - entity provider: families, trade names, contradicting places");

const FAMILY_SIZES: [string, number, string][] = [
  ["johns hopkins", 4, "MD"],
  ["duke", 3, "NC"],
  ["mayo", 19, "MN"],
  ["memorial hermann", 8, "TX"],
  ["houston methodist", 8, "TX"],
];

for (const [phrase, size, state] of FAMILY_SIZES) {
  const r = provider.resolve(phrase);
  const labels: string[] = (r.candidates ?? []).map((c: any) => c.label);
  check(
    `"${phrase}" -> ambiguous over its ${size} facilities, labels lead with the facility name`,
    r.status === "ambiguous" && r.entityId === "hospital" && labels.length === size && labels.every((l) => l.startsWith(phrase.toUpperCase())) && labels.some((l) => l.endsWith(`, ${state}`)),
    JSON.stringify(labels.slice(0, 2)),
  );
}
{
  const states = new Set((provider.resolve("johns hopkins").candidates ?? []).map((c: any) => String(c.label).split(", ").pop()));
  check("Johns Hopkins offers both MD and FL", states.has("MD") && states.has("FL"), [...states].join(","));
}
check(`"memorial hospital" keeps its 12 same-name candidates with place-only labels`, (() => {
  const r = provider.resolve("memorial hospital");
  return r.status === "ambiguous" && r.candidates.length === 12 && r.candidates.every((c: any) => /^[A-Z .'-]+, [A-Z .'-]+ County, [A-Z]{2}$/.test(c.label));
})());
check(`"memorial hermann in katy" narrows the family to one facility (450847)`, (() => {
  const r = provider.resolve("memorial hermann in katy");
  return r.found === true && r.value === "450847";
})());
check(`"houston methodist in houston" narrows to the Houston campuses, name-led labels`, (() => {
  const r = provider.resolve("houston methodist in houston");
  return r.status === "ambiguous" && r.candidates.length === 3 && r.candidates.every((c: any) => c.label.startsWith("HOUSTON METHODIST"));
})());
check(`DBA trade name "memorial health university medical center" resolves to 110036`, provider.resolve("memorial health university medical center").value === "110036");
check(`DBA alias is skipped when the trade name is already an official name ("swedish medical center")`, (() => {
  const officialCount = hospitalIdentityDirectory.filter((r) => normalizeText(r.hospitalName) === "swedish medical center").length;
  const r = provider.resolve("swedish medical center");
  return officialCount >= 1 && !(r.found && r.value === "060034" && officialCount > 1);
})());
check(`"memorial hospital in alabama" -> not_found (12 candidates, none in AL)`, provider.resolve("memorial hospital in alabama").status === "not_found");
check(`"northwest medical center in california" -> not_found`, provider.resolve("northwest medical center in california").status === "not_found");
check(`"memorial hospital in texas" stays ambiguous over the 3 Texas facilities`, (() => {
  const r = provider.resolve("memorial hospital in texas");
  return r.status === "ambiguous" && r.candidates.length === 3;
})());
check(`"memorial hospital in the er" (not a place) keeps the old ambiguity`, provider.resolve("memorial hospital in the er").status === "ambiguous");

// ------------------------------------------------------------------------------------------ 4.2 matcher
console.log("\n4.2 - Turn 2 matcher: CITY, ST and two-option replies");

const gadsden = [
  { facility_id: "010029", hospital_name: "", city: "GADSDEN", county: "ETOWAH", state: "AL", displayLabel: "GADSDEN, ETOWAH County, AL" },
  { facility_id: "131311", hospital_name: "", city: "IDAHO FALLS", county: "BONNEVILLE", state: "ID", displayLabel: "IDAHO FALLS, BONNEVILLE County, ID" },
  { facility_id: "461305", hospital_name: "", city: "PAYSON", county: "UTAH", state: "UT", displayLabel: "PAYSON, UTAH County, UT" },
] as any[];

check(`"GADSDEN, AL" -> Gadsden`, matchClarificationResponse("GADSDEN, AL", gadsden)?.city === "GADSDEN");
check(`"gadsden , al" (spacing, case) -> Gadsden`, matchClarificationResponse("gadsden , al", gadsden)?.city === "GADSDEN");
check(`"GADSDEN, ID" (city and state disagree) -> no match`, matchClarificationResponse("GADSDEN, ID", gadsden) === null);
check(`bare city and bare state still match as before`, matchClarificationResponse("payson", gadsden)?.state === "UT" && matchClarificationResponse("ID", gadsden)?.city === "IDAHO FALLS");

const memorial = hospitalIdentityDirectory
  .filter((r) => r.hospitalName === "MEMORIAL HOSPITAL")
  .map((r) => ({ facility_id: r.facilityId, hospital_name: "", city: r.city, county: r.county, state: r.state, displayLabel: `${r.city}, ${r.county} County, ${r.state}` })) as any[];

{
  const pair = matchClarificationPair("ABILENE and GONZALES", memorial);
  check(`"ABILENE and GONZALES" -> Abilene KS + Gonzales TX`, pair?.[0]?.state === "KS" && pair?.[1]?.state === "TX", JSON.stringify(pair?.map((o: any) => o.city)));
  check(`a single-option reply is not a pair`, matchClarificationPair("ABILENE", memorial) === null);
  check(`the same option twice is not a pair`, matchClarificationPair("ABILENE and ABILENE", memorial) === null);
  check(`one side unmatched is not a pair`, matchClarificationPair("ABILENE and NOWHERE", memorial) === null);
  check(`"&" separates the two sides too`, matchClarificationPair("Abilene & Dumas", memorial)?.[1]?.city === "DUMAS");
  check(`matchClarificationResponse alone still returns null for a two-place reply`, matchClarificationResponse("ABILENE and GONZALES", memorial) === null);
}

// ------------------------------------------------------------------------------------------ 4.3 pre-flight
console.log("\n4.3 - pre-flight clarification (orchestrator, before the pipeline)");

for (const q of ["What about hip and knee readmissions?", "what about Ohio?", "How about Texas", "and what about Ohio?"]) {
  check(`asks for the whole question: ${q}`, typeof preflightClarification(q) === "string" && preflightClarification(q)!.includes("?"));
}
for (const q of ["top 0 hospitals in Texas", "bottom 0 hospitals", "show me the first 00 hospitals"]) {
  check(`asks how many: ${q}`, /How many/.test(preflightClarification(q) ?? ""));
}
for (const q of ["top 10 hospitals in Texas", "top 3 hospitals in Ohio", "hospitals in Ohio", "what is the best hospital in Texas", "show me the first 20 hospitals", "top 100 hospitals", "how many hospitals in Texas"]) {
  check(`goes on to the pipeline: ${q}`, preflightClarification(q) === undefined);
}

// ------------------------------------------------------------------------------------------ engine
async function engineChecks() {
  const real = new SqlExecutor(new SupabaseDatabaseAdapter(createClient(env.supabaseUrl, env.supabaseServiceRoleKey)));
  let sql = 0;
  const executor = new Proxy(real, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function"
        ? (...args: unknown[]) => {
            if (prop === "execute") sql++;
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          }
        : value;
    },
  }) as SqlExecutor;

  const engine = createRuntimeEngine({
    runtime,
    semantic,
    planner,
    executionPlanMapper: new ExecutionPlanMapper(),
    executor,
    preprocessQuestion: expandUppercaseStateAbbreviations,
  });

  const run = async (question: string, extra: Record<string, unknown> = {}) => {
    sql = 0;
    const r: any = await engine.execute({ question, ...extra } as any);
    return { r, sql, rows: (r.rows ?? []) as Record<string, unknown>[] };
  };
  const distinct = (rows: Record<string, unknown>[], column: string) => new Set(rows.map((row) => String(row[column])));

  console.log("\n4.1 - engine: named-hospital families clarify (SQL = 0)");

  for (const question of [
    "Johns Hopkins overall rating",
    "Duke patient experience",
    "Mayo overall rating",
    "houston methodist",
    "Memorial Hermann Hospital",
    "Memorial Hermann Memorial City Medical Center",
    "Memorial Hermann vs Methodist Hospital",
    "memorial vs Mayo",
  ]) {
    const { r, sql: n } = await run(question);
    check(`${question} -> identity-ambiguous, 0 SQL`, r.success === false && r.answerability?.status === "ambiguous" && r.answerability?.reason === "identity-ambiguous" && n === 0, `${r.answerability?.status}/${r.answerability?.reason} sql=${n}`);
  }
  {
    const { r } = await run("Johns Hopkins overall rating");
    const states = new Set((r.answerability?.candidates ?? []).map((c: any) => String(c.label).split(", ").pop()));
    check("Johns Hopkins clarification offers MD and FL, not Hopkins County (KY/TX)", states.has("MD") && states.has("FL") && !states.has("KY"), [...states].join(","));
  }

  console.log("\n4.1 - engine: DBA trade names answer, contradicting places refuse");
  {
    const { r, rows } = await run("Memorial Health University Medical Center");
    check("Memorial Health University Medical Center -> the Savannah, GA facility", r.success === true && rows.length === 1 && rows[0]!.facility_id === "110036", JSON.stringify(rows[0] ?? {}).slice(0, 100));
  }
  for (const question of ["Memorial Hospital in Alabama overall rating", "Northwest Medical Center in California", "Mayo Clinic in Texas overall rating"]) {
    const { r, sql: n } = await run(question);
    check(`${question} -> refused (not clarified, not answered without the name), 0 SQL`, r.success === false && r.answerability?.status === "not_directly_answerable" && r.answerability?.reason === "data-unavailable" && n === 0, `${r.answerability?.status}/${r.answerability?.reason} sql=${n}`);
  }

  console.log("\n4.1 - engine: controls unchanged");
  {
    const { r, sql: n } = await run("Memorial Hospital in Texas overall rating");
    check("Memorial Hospital in Texas -> ambiguous over the 3 Texas facilities", r.answerability?.status === "ambiguous" && r.answerability.candidates.length === 3 && n === 0);
  }
  for (const [question, facility] of [
    ["Northwest Medical Center in Arizona overall rating", "030085"],
    ["Mayo Clinic in Rochester Minnesota overall rating", "240010"],
    ["Memorial Hospital in Dumas Texas", "451386"],
    ["Memorial Hermann in Katy", "450847"],
  ] as const) {
    const { r, rows } = await run(question);
    check(`${question} -> unique facility ${facility}`, r.success === true && rows.some((row) => row.facility_id === facility), `success=${r.success} rows=${rows.length}`);
  }
  {
    const { r, rows } = await run("Compare Mayo Clinic and Cleveland Clinic in Florida on overall rating");
    check("Compare Mayo Clinic and Cleveland Clinic in Florida -> still a comparison", r.success === true && rows.length === 2, `rows=${rows.length}`);
  }

  console.log("\n4.2 - engine: the second slot of a two-place reply settles the second ambiguity");
  {
    const memorialRecords = hospitalIdentityDirectory.filter((r) => r.hospitalName === "MEMORIAL HOSPITAL");
    const abilene = memorialRecords.find((r) => r.city === "ABILENE")!;
    const gonzales = memorialRecords.find((r) => r.city === "GONZALES")!;
    const question = "Compare Memorial Hospital vs Memorial Hospital";
    const base = { identityAlreadyResolved: true, forcedIdentityCandidate: { value: abilene.facilityId }, forcedIntent: "comparison" };

    const both = await run(question, { ...base, companionEntities: [{ canonicalKey: "hospital", value: gonzales.facilityId }] });
    check(
      "forced Abilene + companion Gonzales -> comparison of exactly those two facilities",
      both.r.success === true && both.rows.length === 2 && distinct(both.rows, "state").has("KS") && distinct(both.rows, "state").has("TX"),
      `success=${both.r.success} rows=${both.rows.length}`,
    );
    const one = await run(question, base);
    check("forced Abilene alone -> the second mention is still ambiguous (0 SQL)", one.r.answerability?.reason === "identity-ambiguous" && one.sql === 0);
    const single = await run("compare memorial hospital vs Mayo Clinic", { ...base, companionEntities: [{ canonicalKey: "hospital", value: "100151" }] });
    check("existing shape (one ambiguous mention + one resolved companion) still compares", single.r.success === true && single.rows.length === 2, `success=${single.r.success} rows=${single.rows.length}`);
  }

  console.log("\n4.3 - engine: a star-rating filter needs a place");
  for (const question of ["show me 5 star hospitals", "show me 3 star hospital", "government 5 star hospitals"]) {
    const { r, sql: n } = await run(question);
    const candidates: any[] = r.answerability?.candidates ?? [];
    check(`${question} -> asks for a state (${candidates.length} options), 0 SQL`, r.success === false && r.answerability?.status === "ambiguous" && candidates.length >= 50 && candidates.some((c) => c.label === "Texas") && n === 0, `${r.answerability?.status} n=${candidates.length}`);
  }
  for (const [question, column, value] of [
    ["Show me 5-star hospitals in Texas", "state", "TX"],
    ["5-star hospitals in Georgia", "state", "GA"],
    ["5 star hospitals in Harris County", "county", "HARRIS"],
  ] as const) {
    const { r, rows } = await run(question);
    check(`${question} -> answered, scoped to ${value}`, r.success === true && rows.length > 0 && distinct(rows, column).size === 1 && distinct(rows, column).has(value), `rows=${rows.length}`);
  }
  {
    const { r } = await run("how many 5 star hospitals by state");
    check("a grouped star request is left alone (nationwide by design, not a clarification)", r.answerability?.status !== "ambiguous");
  }

  console.log("\n4.3 - engine: ranking idioms and grouping");
  {
    const { r, rows } = await run("hospitals ranked by state");
    check("hospitals ranked by state -> one best hospital per state", r.success === true && rows.length >= 50 && Object.keys(rows[0] ?? {}).join(",") === "state,facility_id,hospital_name,overall_rating", `rows=${rows.length} ${Object.keys(rows[0] ?? {}).join(",")}`);
  }
  {
    const { r, rows } = await run("For each county in Texas, which hospital comes out on top?");
    check("for each county in Texas, which hospital comes out on top -> one row per county, Texas only", r.success === true && rows.length > 20 && distinct(rows, "state").size === 1 && distinct(rows, "state").has("TX") && "county" in (rows[0] ?? {}), `rows=${rows.length}`);
    const resolved = semantic.resolve("For each county in Texas, which hospital comes out on top?");
    check("its rewrite-trigger words count as understood (no model call needed)", planner.isFullyUnderstood(resolved.normalizedQuery, resolved.matches, runtime.domain.entities));
  }
  {
    const resolved = semantic.resolve("hospitals with lead poisoning");
    check("an unrelated unaccounted word still counts as not understood", !planner.isFullyUnderstood(resolved.normalizedQuery, resolved.matches, runtime.domain.entities));
  }
  {
    const { r, rows } = await run("hospitals ranked by mortality rate in Texas");
    check("an explicit metric still wins over the ranking idiom", r.success === true && "mort_measures_worse" in (rows[0] ?? {}), Object.keys(rows[0] ?? {}).join(","));
  }
  {
    const { r, rows } = await run("best hospitals in Texas");
    check("best hospitals in Texas unchanged", r.success === true && rows.length === 10 && distinct(rows, "state").has("TX"));
  }
}

engineChecks()
  .catch((error) => {
    failed++;
    console.log(`  [FAIL] engine checks crashed - ${error instanceof Error ? error.message : String(error)}`);
  })
  .finally(() => {
    console.log("\n" + "=".repeat(60));
    console.log(`RESULT: ${passed} passed, ${failed} failed (${passed + failed} total)`);
    process.exit(failed > 0 ? 1 : 0);
  });
