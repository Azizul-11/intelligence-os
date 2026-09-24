#!/usr/bin/env tsx

/**
 * Batch 3 (LLM vocabulary, polarity, benchmark, pre-check) verification. No LLM is called: the engine checks wire the
 * real hook body (`normalizeQuestion`) with a stub normalizer, against the live warehouse (read-only SELECTs).
 *
 *   3.0  deterministic pre-check on the raw question (services/normalizer-hook.ts) + the DC / last-year topic data
 *
 * Usage: pnpm exec tsx scripts/verify-batch3-vocab-polarity.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { normalizeQuestion, precheckUnsupported } from "../supabase/functions/orchestrator/services/normalizer-hook";
import { healthcareDomain, DOMAIN_CAPABILITIES } from "../domain-packs/healthcare/src/index";
import { expandUppercaseStateAbbreviations } from "../domain-packs/healthcare/src/runtime/state-abbreviation-preprocessor";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { SqlExecutor } from "../packages/sql-executor/src/sql-executor";
import { SupabaseDatabaseAdapter } from "../packages/sql-executor/src/supabase-database-adapter";
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

// ------------------------------------------------------------------------------------------ 3.0 topic data
console.log("\n3.0 - unsupported-topic data");

const topics = DOMAIN_CAPABILITIES.unsupportedTopics;

for (const topic of [
  // Batch 5B-1: "stroke", "hospital wide", "all cause", "military", "church owned" and "department of defense" are
  // registered now (concepts/stroke.ts, concepts/hospital-wide-mortality.ts, runtime/ownership-directory.ts) and
  // dropped from this list; the narrower literals that still have no measure or map replace them below.
  // Batch 5B-4: "birthing friendly", "emergency services" and "hospital type" are registered now
  // (runtime/hospital-attribute-directory.ts); emergency-room waits and volumes, which no table holds, replace them.
  // Batch 5B-5: "dc", "d.c." and "district of columbia" are a registered jurisdiction now.
  "emergency department", "er wait",
  "stroke readmission", "stroke complications", "hospital wide readmission",
  // Batch 5B-2: "sepsis"/"psi" are registered now (concepts/psi.ts, concepts/sepsis.ts); the sepsis wording that
  // implies a measure the warehouse does not have replaces the bare word.
  "sepsis mortality", "sepsis survival", "sepsis recovery", "psi 5", "psi 05",
  // Batch 5B-3: "sanitary" and "cleanest" are registered survey wording now; the survey topics with no data replace them.
  "decile", "ed waits", "staff responsiveness", "care transition",
  "wait times", "volumes",
]) {
  check(`topic list names "${topic}"`, topics.includes(topic), `list has ${topics.length} entries`);
}
for (const topic of ["stroke", "hospital wide", "all cause", "military", "church owned", "department of defense"]) {
  check(`topic list no longer names "${topic}" (Batch 5B-1)`, !topics.includes(topic), `list has ${topics.length} entries`);
}
for (const topic of ["sepsis", "psi", "pressure ulcer", "pressure ulcers", "blood clot", "blood clots", "kidney injury", "in-hospital falls", "falls with fracture", "patient safety indicator", "patient safety indicators"]) {
  check(`topic list no longer names "${topic}" (Batch 5B-2)`, !topics.includes(topic), `list has ${topics.length} entries`);
}
check(`"last year" is not a topic (narrative use trips it)`, !topics.includes("last year"));

// ------------------------------------------------------------------------------------------ 3.0 pre-check (pure)
console.log("\n3.0 - pre-check on the raw question");

const REFUSED: [string, string][] = [
  // Batch 5A-1: "heart surgery" is a layperson phrase now (it maps to bypass surgery), no longer refused; ED waits took its place.
  ["show me hospital ED waits in Texas", "ed waits"],
  ["sepsis mortality", "sepsis mortality"],
  // Batch 5B-1: stroke and hospital-wide mortality are registered; only their readmission/complication wording,
  // which the warehouse has no measure for, stays refused (their own bare/mortality forms moved to NOT_REFUSED below).
  ["stroke readmission rates", "stroke readmission"],
  ["hospitals with the fewest stroke complications", "stroke complications"],
  ["hospital wide readmission rates", "hospital wide readmission"],
  // Batch 5B-3: "most sanitary" is answered now (D9, Cleanliness); staff responsiveness (no data) replaces it.
  ["Which hospitals have the highest scores for staff responsiveness?", "staff responsiveness"],
  ["top decile hospitals by rating", "decile"],
  // Batch 5B-5: the five DC spellings are answered now (moved to NOT_REFUSED below); a region takes their place.
  ["hospitals in the bay area", "bay area"],
  // Batch 5B-4: birthing-friendly is a registered flag now (moved to NOT_REFUSED below); ER waits replace it.
  ["hospitals with the shortest ER wait times in Ohio", "wait times"],
];

for (const [question, topic] of REFUSED) {
  const hits = precheckUnsupported(question, DOMAIN_CAPABILITIES);
  check(`refused: ${question}`, hits.some((hit) => hit.replace(/-/g, " ") === topic.replace(/-/g, " ")), `hits=${JSON.stringify(hits)}`);
}

const NOT_REFUSED = [
  "okay so my dad had a heart attack last year and we live in Ohio",
  "best hospitals in Oregon",
  "hospitals in Washington",
  "hospitals in Washington State",
  "DCH Regional Medical Center",
  // Batch 5B-5: DC is a registered jurisdiction now.
  "hospitals in Washington DC",
  "HOSPITALS IN WASHINGTON DC",
  "hospitals in Washington, D.C.",
  "hospitals in D.C.",
  "hospitals in the District of Columbia",
  "hospitals in Dallas",
  "mortality rate for pneumonia in Ohio",
  "hospitals with the lowest heart attack death rate in Ohio",
  "I want a state-by-state view of the top hospitals",
  "which state has better-rated hospitals, Texas or California?",
  "government hospitals in Ohio",
  // Batch 5B-4: hospital types and the emergency-services / birthing-friendly flags are registered now.
  "hospitals with birthing-friendly designation in Ohio",
  "birthing friendly hospitals in Texas",
  "hospitals with emergency services in Ohio",
  "childrens hospitals in California",
  "psychiatric hospitals in Florida",
  "Show me acute care hospitals in Ohio.",
  // Batch 5B-1: stroke, hospital-wide mortality and the ownership sub-labels are registered now.
  "stroke mortality",
  "best hospitals for stroke",
  "hospital wide mortality",
  "overall all-cause mortality by hospital",
  "physician owned hospitals",
  "tribal hospitals",
  "church owned hospitals",
  "Department of Defense hospitals",
  "military hospitals",
  // Batch 5B-2: the patient safety indicators and postoperative sepsis are registered now.
  "postoperative sepsis rate",
  "pressure ulcer rate",
  "in-hospital falls with fracture",
  "postoperative kidney injury requiring dialysis",
  "blood clots after surgery",
  "patient safety indicators",
  "PSI 90 composite",
  // Batch 5B-3: the patient-survey dimensions are registered now.
  "cleanest hospitals",
  "most sanitary hospitals in Texas",
  "best nurse communication",
  "quietest hospitals at night",
];

for (const question of NOT_REFUSED) {
  const hits = precheckUnsupported(question, DOMAIN_CAPABILITIES);
  check(`not refused: ${question}`, hits.length === 0, `hits=${JSON.stringify(hits)}`);
}

check(
  // Batch 5B-3: "nurse communication" is registered now; "staff responsiveness" contains the shorter topic "responsiveness".
  "a topic inside a longer matched topic is reported once (staff responsiveness, not also responsiveness)",
  JSON.stringify(precheckUnsupported("best staff responsiveness", DOMAIN_CAPABILITIES)) === JSON.stringify(["staff responsiveness"]),
  JSON.stringify(precheckUnsupported("best staff responsiveness", DOMAIN_CAPABILITIES)),
);

// Catalog-wide: the pre-check never refuses a question the catalog expects to be answered or clarified.
{
  const catalog = JSON.parse(
    readFileSync(resolve(__dirname, "../docs/LLM-FIRST-FRONT/DogfoodingV1/500_DOGFOODING_QUERY_CATALOG.json"), "utf-8"),
  ) as { id: string; query: string; expectedBehavior: string }[];
  const refused = catalog.filter((row) => precheckUnsupported(row.query, DOMAIN_CAPABILITIES).length > 0);
  const wrong = refused.filter((row) => row.expectedBehavior !== "REFUSE");
  check(`catalog (${catalog.length} rows): 0 answer/clarify-expected rows refused by the pre-check`, wrong.length === 0, wrong.map((row) => row.id).join(","));
  // Batch 5A-1 (D3): 79 -> 73. Rows A073, A095-A099 (heart checkup / heart problem / heart surgery / trouble breathing /
  // breathing problems / lung infection) are layperson asks now expected to be answered (catalog revision), no longer REFUSE.
  // Batch 5B-1: A100, A104, A105, D010, D011, D074 (stroke, hospital-wide mortality, ownership sub-labels) are
  // registered now and no longer caught by the pre-check: measured 73 -> 63 (the catalog's own expectedBehavior for
  // these rows is unchanged by this suite - see the 5B audit's 7.5 / this batch's own report for the flip; the drop
  // is larger than 6 because some of the same rows matched two topics, e.g. "military" and "department of defense"
  // wording in the same query, each counted once by the earlier, higher baseline).
  // Batch 5B-2: A109-A117, A119 (9 PSI rows) are registered now and no longer caught: measured 63 -> 53. A103, A108,
  // A118 keep their own literal (sepsis mortality/recovery, hospital acquired infections) and stay caught.
  // Batch 5B-3: the 14 survey-dimension rows (B019-B027, B030, B031, B034, B036, B037, B044) are registered now and no
  // longer caught: measured 53 -> 39. B028/B033 (item level, "listen carefully"), B032 ("doctors") and B042 (staff
  // responsiveness, no data) keep their literal and stay caught.
  // Batch 5B-4: the 11 hospital-type / flag rows (D001-D006, D015, D075-D077, E069) are registered now and no longer
  // caught: measured 39 -> 28.
  // Batch 5B-5: C023 and C076 (DC) are a registered jurisdiction now and no longer caught: measured 28 -> 26.
  check(`catalog: the pre-check catches at least 26 REFUSE-expected rows`, refused.length - wrong.length >= 26, `caught ${refused.length - wrong.length}`);
  for (const id of ["D090", "D091", "A103", "A108", "A118", "B028", "B032", "B033", "B042"]) {
    check(`catalog row ${id} is caught by the pre-check`, refused.some((row) => row.id === id));
  }
  for (const id of [
    "A100", "A104", "A105", "D010", "D011", "D074", "A109", "A110", "A111", "A112", "A113", "A114", "A115", "A116", "A117", "A119",
    "B019", "B020", "B021", "B022", "B023", "B024", "B026", "B027", "B030", "B031", "B034", "B036", "B037", "B044",
    "D001", "D002", "D003", "D004", "D005", "D006", "D015", "D075", "D076", "D077", "E069", "C023", "C076",
  ]) {
    check(`catalog row ${id} is no longer caught by the pre-check (Batch 5B-1 to 5B-5)`, !refused.some((row) => row.id === id));
  }
  check("F055 (my dad had a heart attack last year) is not caught", !refused.some((row) => row.id === "F055"));
}

// ------------------------------------------------------------------------------------------ 3.0 hook + engine
async function engineChecks() {
  console.log("\n3.0 - hook body: no model call for a pre-check refusal, mapping unchanged otherwise");

  let calls = 0;
  const normalize = async (text: string) => {
    calls++;
    return { status: "ok" as const, canonical_question: `Show me hospitals in Ohio (${text})` };
  };

  // Batch 5B-1: "stroke mortality" is registered now; "hospital acquired infections" still has no measure.
  const refusal = await normalizeQuestion("hospital acquired infections", DOMAIN_CAPABILITIES, normalize);
  check("pre-check refusal calls the normalizer 0 times", calls === 0, `calls=${calls}`);
  check(
    "pre-check refusal is { unsupportedTerms, meta.source = pre-check }",
    !!refusal && "unsupportedTerms" in refusal && refusal.unsupportedTerms[0] === "hospital acquired infections" && refusal.meta?.source === "pre-check",
    JSON.stringify(refusal),
  );
  const passthrough = await normalizeQuestion("hospitals in ohio", DOMAIN_CAPABILITIES, normalize);
  check("a clean question reaches the normalizer once and maps to a canonical question", calls === 1 && !!passthrough && "canonicalQuestion" in passthrough, JSON.stringify(passthrough));

  console.log("\n3.0 - engine: refused before planning, 0 SQL, trace names the pre-check");

  const runtime = createDomainRuntime(healthcareDomain);
  const planner = new QueryPlanner();
  const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
  let modelCalls = 0;
  const engine = createRuntimeEngine({
    runtime,
    semantic,
    planner,
    executionPlanMapper: new ExecutionPlanMapper(),
    executor: new SqlExecutor(new SupabaseDatabaseAdapter(createClient(env.supabaseUrl, env.supabaseServiceRoleKey))),
    preprocessQuestion: expandUppercaseStateAbbreviations,
    llmFallback: (question: string) =>
      normalizeQuestion(question, DOMAIN_CAPABILITIES, async () => {
        modelCalls++;
        return { status: "fallback" as const };
      }),
  });

  // Batch 5B-1: "stroke mortality" and "military hospitals" are registered now; their own still-unsupported
  // readmission/complication literals take their place.
  // Batch 5B-5: DC is registered; a region and another still-unsupported literal take its two places.
  for (const question of ["hospitals in the bay area", "ED waits in Texas", "stroke readmission rates", "hospital wide readmission"]) {
    const r = await engine.execute({ question });
    const gate = (r.trace ?? []).find((g) => g.phase === "llm-normalization" && g.status === "unsupported");
    const executed = (r.trace ?? []).some((g) => g.phase === "deterministic-warehouse-execution");
    check(
      `${question} -> refused, no execution, trace unsupported/pre-check`,
      r.success === false && (r.rows ?? []).length === 0 && !executed && gate?.detail?.source === "pre-check",
      `success=${r.success} executed=${executed} gate=${JSON.stringify(gate?.detail)}`,
    );
  }
  check("no normalizer call was made for any of them", modelCalls === 0, `modelCalls=${modelCalls}`);

  // ---------------------------------------------------------------------------------------- 3.1 polarity
  console.log("\n3.1 - polarity: the ranking word and the metric decide best-first vs worst-first");

  const numbers = async (question: string, column: string) => {
    const r = await engine.execute({ question });
    return { r, values: ((r.rows ?? []) as Record<string, unknown>[]).map((row) => Number(row[column])) };
  };

  // [question, column, higher-is-better, wants best first]. Best first = the largest value first when higher is better,
  // the smallest first when lower is better; worst first is the reverse. Ties (all equal) satisfy either order.
  const POLARITY: [string, string, boolean, boolean][] = [
    // condition measures: a raw death rate / excess ratio, lower is better
    ["hospitals with best heart attack mortality rate in Ohio", "score", false, true],
    ["hospitals with lowest heart attack mortality rate in Ohio", "score", false, true],
    ["hospitals with top heart attack mortality rate in Ohio", "score", false, true],
    ["hospitals with worst heart attack mortality rate in Ohio", "score", false, false],
    ["hospitals with highest heart attack mortality rate in Ohio", "score", false, false],
    ["hospitals with bottom heart attack mortality rate in Ohio", "score", false, false],
    ["highest heart attack death rate hospitals in Ohio", "score", false, false],
    ["hospitals with best pneumonia readmission rate in Ohio", "excess_readmission_ratio", false, true],
    ["hospitals with lowest pneumonia readmission rate in Ohio", "excess_readmission_ratio", false, true],
    ["hospitals with worst pneumonia readmission rate in Ohio", "excess_readmission_ratio", false, false],
    ["hospitals with the highest pneumonia readmission rate", "excess_readmission_ratio", false, false],
    ["Show me hospitals with highest Mortality Rate for Pneumonia", "score", false, false],
    ["Show me hospitals with highest Mortality Rate for Heart Failure", "score", false, false],
    ["Show me hospitals with lowest Mortality Rate for Pneumonia", "score", false, true],
    // generic mortality / readmission: a count of measures better than national, higher is better
    ["hospitals with best mortality rate", "mort_measures_better", true, true],
    ["hospitals with top mortality rate", "mort_measures_better", true, true],
    ["hospitals with lowest mortality rate", "mort_measures_better", true, true],
    ["hospitals with worst mortality rate", "mort_measures_better", true, false],
    ["hospitals with bottom mortality rate", "mort_measures_better", true, false],
    ["hospitals with highest mortality rate", "mort_measures_better", true, false],
    ["hospitals with lowest readmission rate", "readm_measures_better", true, true],
    ["hospitals with highest readmission rate", "readm_measures_better", true, false],
    // higher-is-better metrics: every ranking word already agreed and still does
    ["hospitals with best patient experience", "avg_patient_satisfaction", true, true],
    ["hospitals with highest patient experience", "avg_patient_satisfaction", true, true],
    ["hospitals with worst patient experience", "avg_patient_satisfaction", true, false],
    ["hospitals with lowest patient experience", "avg_patient_satisfaction", true, false],
  ];

  for (const [question, column, higherIsBetter, wantsBestFirst] of POLARITY) {
    const { r, values } = await numbers(question, column);
    const first = values[0] ?? NaN;
    const last = values[values.length - 1] ?? NaN;
    const wantsAscending = higherIsBetter ? !wantsBestFirst : wantsBestFirst;
    const ordered = values.length >= 2 && (wantsAscending ? first <= last : first >= last);
    const strict = new Set(values).size === 1 || (wantsAscending ? first < last : first > last);
    check(
      `${question} -> ${wantsBestFirst ? "best" : "worst"} first`,
      r.success === true && ordered && strict,
      `success=${r.success} ${column}=${values.join(",")}`,
    );
  }

  for (const [question, column, wantsMax] of [
    ["hospitals with best overall rating", "overall_rating", true],
    ["hospitals with worst overall rating", "overall_rating", false],
    ["hospitals with highest safety performance", "safety_score", true],
    ["hospitals with lowest safety performance", "safety_score", false],
  ] as const) {
    const { values } = await numbers(question, column);
    check(`${question} -> ${wantsMax ? "top" : "bottom"} value first`, values.length > 0 && (wantsMax ? values[0]! >= (values[values.length - 1] ?? 0) : values[0]! <= (values[values.length - 1] ?? 0)), values.join(","));
  }

  // ---------------------------------------------------------------------------------------- 3.2 vocabulary
  console.log("\n3.2 - vocabulary: outcome(s), hip/knee complications, state owned, condition after a listing phrase");

  const rowsOf = async (question: string) => {
    const r = await engine.execute({ question });
    return { r, rows: (r.rows ?? []) as Record<string, unknown>[] };
  };
  const distinct = (rows: Record<string, unknown>[], column: string) => new Set(rows.map((row) => String(row[column] ?? "")));

  for (const [question, code] of [
    ["best pneumonia outcome hospitals", "MORT_30_PN"],
    ["best pneumonia outcomes", "MORT_30_PN"],
    ["best hospitals for heart attack outcomes", "MORT_30_AMI"],
    ["knee replacement complications", "COMP_HIP_KNEE"],
    ["hip and knee complication", "COMP_HIP_KNEE"],
    ["complication rate for hip replacement", "COMP_HIP_KNEE"],
    ["highest hip and knee replacement complication rates", "COMP_HIP_KNEE"],
    ["non-profit hospitals in Florida for pneumonia mortality", "MORT_30_PN"],
    ["hospitals in Texas with heart attack mortality", "MORT_30_AMI"],
  ] as const) {
    const { r, rows } = await rowsOf(question);
    const codes = distinct(rows, "measure_code");
    check(`${question} -> ${code} only`, r.success === true && rows.length > 0 && codes.size === 1 && codes.has(code), `success=${r.success} codes=${[...codes].join(",")}`);
  }
  {
    const { values } = await numbers("highest hip and knee replacement complication rates", "score");
    check("highest ... complication rates -> worst (highest) first", values.length > 1 && values[0]! > values[values.length - 1]!, values.join(","));
    const { r } = await rowsOf("pneumonia complications");
    check("pneumonia complications is still refused, not answered as pneumonia mortality", r.success === false, `success=${r.success}`);
  }
  {
    const { r, rows } = await rowsOf("state owned hospitals in Ohio");
    const owners = distinct(rows, "ownership");
    check("state owned hospitals in Ohio -> Government - State only", r.success === true && rows.length > 0 && owners.size === 1 && owners.has("Government - State"), [...owners].join(","));
  }
  {
    const { rows } = await rowsOf("non-profit hospitals in Florida for pneumonia mortality");
    check("non-profit + Florida still scope the condition ranking", distinct(rows, "state").size === 1 && distinct(rows, "state").has("FL") && [...distinct(rows, "ownership")].every((owner) => owner.startsWith("Voluntary non-profit")), `${[...distinct(rows, "state")]} ${[...distinct(rows, "ownership")]}`);
    const listing = await rowsOf("non-profit hospitals in Florida");
    check(
      "a plain non-profit Florida listing is unchanged (no condition measure column, Florida non-profit rows)",
      listing.r.success === true && listing.rows.length > 0 && !("measure_code" in (listing.rows[0] ?? {})) && distinct(listing.rows, "state").size === 1,
      `rows=${listing.rows.length}`,
    );
  }

  console.log("\n3.2 - the highest-rated idiom is understood on the first pass; named-hospital mortality is the mortality family only");

  {
    const resolvedRated = semantic.resolve(expandUppercaseStateAbbreviations("Show me the highest-rated hospitals in New York by county"));
    check("highest-rated ... by county is fully understood (no LLM front door to drop 'by county')", planner.isFullyUnderstood(resolvedRated.normalizedQuery, resolvedRated.matches, runtime.domain.entities));
    const byCounty = await rowsOf("Show me the highest-rated hospitals in New York by county");
    check("highest-rated ... by county -> one row per county, New York only", byCounty.r.success === true && byCounty.rows.length > 20 && distinct(byCounty.rows, "state").size === 1 && distinct(byCounty.rows, "county").size === byCounty.rows.length, `rows=${byCounty.rows.length} counties=${distinct(byCounty.rows, "county").size}`);
    const perState = await rowsOf("For every state, show me the highest-rated hospital");
    check("for every state -> one row per state", perState.r.success === true && perState.rows.length > 40 && distinct(perState.rows, "state").size === perState.rows.length, `rows=${perState.rows.length}`);
    const callsBefore = modelCalls;
    const c071 = await rowsOf("which state has better-rated hospitals, Texas or California?");
    check("C071 (better-rated hospitals, Texas or California) is answered without the LLM front door", c071.r.success === true && c071.rows.length > 0 && modelCalls === callsBefore, `rows=${c071.rows.length} modelCalls=${modelCalls - callsBefore}`);
    for (const question of ["Mayo Clinic mortality rate", "Duke University Hospital mortality rate"]) {
      const named = await rowsOf(question);
      const codes = [...distinct(named.rows, "measure_code")];
      check(`${question} -> mortality measures only`, named.r.success === true && codes.length > 0 && codes.every((code) => code.startsWith("MORT") || code === "COMP_HIP_KNEE"), codes.join(","));
    }
  }

  // ---------------------------------------------------------------------------------------- 3.3 benchmark
  console.log("\n3.3 - benchmark: performing / beat / national benchmark reach the benchmark template, comparison side follows the metric");

  for (const question of [
    "California hospitals performing above national average mortality",
    "show me hospitals performing above national mortality average",
    "hospitals performing above national readmission average",
    "Which hospitals beat the national mortality average?",
    "Which Texas hospitals are above the national benchmark for overall rating?",
  ]) {
    const resolved = semantic.resolve(expandUppercaseStateAbbreviations(question));
    check(`fully understood on the first pass (no LLM front door): ${question}`, planner.isFullyUnderstood(resolved.normalizedQuery, resolved.matches, runtime.domain.entities));
  }

  const betterThanNational = (rows: Record<string, unknown>[], column: string) => rows.length > 0 && rows.every((row) => Number(row[column]) > 0);

  for (const [question, column, wantsBetter] of [
    ["hospitals with mortality rate lower than national average", "mort_measures_better", true],
    ["hospitals with mortality rate below national average", "mort_measures_better", true],
    ["Which hospitals beat the national mortality average?", "mort_measures_better", true],
    ["show me hospitals performing above national mortality average", "mort_measures_better", true],
    ["hospitals with readmission rate lower than national average", "readm_measures_better", true],
    ["mortality rate above the national average", "mort_measures_worse", true],
    ["hospitals performing below national readmission average", "readm_measures_worse", true],
  ] as const) {
    const { r, rows } = await rowsOf(question);
    check(`${question} -> ${wantsBetter ? "" : "not "}${column.endsWith("worse") ? "worse-than-national" : "better-than-national"} hospitals`, r.success === true && betterThanNational(rows, column), `success=${r.success} ${column}=${rows.map((row) => row[column]).join(",")}`);
  }
  {
    // "national benchmark" (no aggregation keyword) used to read as a lookup and answer a generic ranking.
    const { r, rows } = await rowsOf("Which Texas hospitals are above the national benchmark for overall rating?");
    const columns = Object.keys(rows[0] ?? {});
    check(
      "above the national benchmark for overall rating -> the benchmark template (state, facility_id, hospital_name, overall_rating only)",
      r.success === true && rows.length > 0 && columns.join(",") === "state,facility_id,hospital_name,overall_rating" && distinct(rows, "state").has("TX"),
      columns.join(","),
    );
  }
  {
    const above = await numbers("hospitals with overall rating above the national average", "overall_rating");
    const below = await numbers("hospitals with overall rating below the national average", "overall_rating");
    check("higher-is-better metric unchanged: rating above -> top stars, below -> bottom stars", above.values.length > 0 && below.values.length > 0 && above.values[0]! > below.values[0]!, `${above.values[0]} vs ${below.values[0]}`);
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
