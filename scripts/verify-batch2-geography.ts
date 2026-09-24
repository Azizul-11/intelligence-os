#!/usr/bin/env tsx

/**
 * Batch 2 (geographic and territory resolution) verification. Deterministic: no LLM is wired, so a pass here is the
 * resolver and planner alone (the live warehouse is read with SELECTs).
 *
 *   2.1  entity-overlap suppression uses inclusive span ends (packages/semantic semantic-pipeline.ts)
 *   2.2  shouted messages skip the colliding state codes; "in VA" is Virginia (state-abbreviation-preprocessor.ts)
 *   2.3  a city or county that exists in exactly one state derives that state (parameter-resolver.ts)
 *   2.5  exact-literal informal city names (entity-provider.ts)
 *
 * Usage: pnpm exec tsx scripts/verify-batch2-geography.ts
 */
import "dotenv/config";

import { healthcareDomain } from "../domain-packs/healthcare/src/index";
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

// ------------------------------------------------------------------------------------------ 2.2 preprocessor (pure)
console.log("\n2.2 - state-abbreviation preprocessor");

const PREPROCESS: [string, string][] = [
  ["hospitals in VA", "hospitals in Virginia"],
  ["hospitals In VA please", "hospitals In Virginia please"],
  ["VA hospitals", "VA hospitals"], // Veterans alias untouched
  ["VA hospital in Texas", "VA hospital in Texas"],
  ["hospitals in va", "hospitals in va"], // lowercase stays ambiguous
  ["PLEASE SHOW ME HOSPITALS IN TEXAS!!!", "PLEASE SHOW ME HOSPITALS IN TEXAS!!!"], // shouted: ME / IN are words
  ["Please show me hospitals in TEXAS!!!", "Please show me hospitals in TEXAS!!!"], // "ME"/"IN" are lowercase words here
  ["show me hospitals in CA", "show me hospitals in California"],
  ["hospitals in OH", "hospitals in Ohio"], // colliding code still expands when the message has lowercase
  ["government hospital IN", "government hospital Indiana"],
];

for (const [input, expected] of PREPROCESS) {
  const actual = expandUppercaseStateAbbreviations(input);
  check(`${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, actual === expected, `got ${JSON.stringify(actual)}`);
}

// ------------------------------------------------------------------------------------------ engine
type Row = Record<string, unknown>;

async function engineChecks() {
  const runtime = createDomainRuntime(healthcareDomain);
  const engine = createRuntimeEngine({
    runtime,
    semantic: createSemanticResolver(runtime.registry, runtime.entityProvider),
    planner: new QueryPlanner(),
    executionPlanMapper: new ExecutionPlanMapper(),
    executor: new SqlExecutor(new SupabaseDatabaseAdapter(createClient(env.supabaseUrl, env.supabaseServiceRoleKey))),
    preprocessQuestion: expandUppercaseStateAbbreviations,
  });

  async function ask(question: string) {
    const r = await engine.execute({ question });
    const rows = (r.rows ?? []) as Row[];
    const values = (column: string) => new Set(rows.map((row) => String(row[column] ?? "")));
    return { r, rows, values };
  }

  console.log("\n2.1 / 2.3 - a state, a county or a single-state city scopes the answer to exactly that place");

  const ONLY_STATE: [string, string][] = [
    ["hospitals in New York", "NY"],
    ["hospitals in NY", "NY"],
    ["hospitals in New Jersey", "NJ"],
    ["hospitals in North Carolina", "NC"],
    ["best hospitals in North Carolina", "NC"],
    ["hospitals in West Virginia", "WV"], // Virginia is a different state
    ["hospitals in wv", "WV"],
    ["hospitals in VA", "VA"],
    ["PLEASE SHOW ME HOSPITALS IN TEXAS!!!", "TX"],
    ["hospitals in Chicago", "IL"], // single-state city, no state named
    ["hospitals in Los Angeles", "CA"],
    ["hospitals in Austin", "TX"],
    ["hospitals in Harris County", "TX"], // single-state county
    ["hospitals in Maricopa County", "AZ"],
    ["hospitals in Cook County Illinois", "IL"],
    ["hospitals in Springfield Missouri", "MO"],
    ["hospitals in Washington County Pennsylvania", "PA"],
  ];

  for (const [question, state] of ONLY_STATE) {
    const { r, rows, values } = await ask(question);
    check(
      `${question} -> ${state} only`,
      r.success === true && rows.length > 0 && values("state").size === 1 && values("state").has(state),
      `success=${r.success} rows=${rows.length} states=${[...values("state")].join(",")} err=${r.error ?? ""}`,
    );
  }

  console.log("\n2.1 - explicit multi-state requests keep every named state and nothing else");

  {
    const { r, rows, values } = await ask("hospitals in West Virginia and Virginia");
    check(
      "West Virginia and Virginia -> WV and VA",
      r.success === true && rows.length > 0 && values("state").has("WV") && values("state").has("VA") && values("state").size === 2,
      `states=${[...values("state")].join(",")}`,
    );
  }
  {
    const { r, rows, values } = await ask("hospitals in New York and New Jersey");
    check(
      "New York and New Jersey -> NY and NJ",
      r.success === true && rows.length > 0 && values("state").size === 2 && values("state").has("NY") && values("state").has("NJ"),
      `states=${[...values("state")].join(",")}`,
    );
  }
  {
    const { r, rows, values } = await ask("best hospitals in wv, wi and wy");
    check(
      "wv, wi and wy -> WV, WI, WY (no VA)",
      r.success === true && rows.length > 0 && !values("state").has("VA") && ["WV", "WI", "WY"].every((s) => values("state").has(s)),
      `states=${[...values("state")].join(",")}`,
    );
  }

  console.log("\n2.3 - county and city scope is applied, not just the state");

  for (const [question, county] of [
    ["hospitals in Cook County Illinois", "COOK"],
    ["hospitals in Harris County Texas", "HARRIS"],
    ["hospitals in Franklin County Ohio", "FRANKLIN"],
  ] as const) {
    const { r, rows, values } = await ask(question);
    check(`${question} -> county ${county}`, r.success === true && rows.length > 0 && values("county").size === 1 && values("county").has(county), `counties=${[...values("county")].join(",")}`);
  }
  {
    const { r, rows, values } = await ask("hospitals in Chicago");
    check("hospitals in Chicago -> city CHICAGO only", r.success === true && rows.length > 0 && values("city").size === 1 && values("city").has("CHICAGO"), `cities=${[...values("city")].join(",")}`);
  }

  console.log("\n2.3 - a name that exists in several states still clarifies, with 0 SQL (Phase 8: ambiguous => no SQL)");

  for (const question of ["hospitals in Houston", "Cook County hospitals", "hospitals in Jackson County", "hospitals in Springfield"]) {
    const { r, rows } = await ask(question);
    const ambiguous = r.answerability?.status === "ambiguous" || r.answerability?.status === "needs_clarification" || (r as { ambiguity?: unknown }).ambiguity !== undefined;
    const noSql = (r.trace ?? []).every((gate) => gate.phase !== "deterministic-warehouse-execution");
    check(`${question} -> clarification, no execution`, rows.length === 0 && noSql && (ambiguous || r.success === false), `status=${r.answerability?.status} rows=${rows.length}`);
  }
  {
    // The offered states are the COUNTY's states, not the states of same-named cities (the spurious city is gone).
    const { r } = await ask("Cook County hospitals");
    const labels = ((r.answerability as { candidates?: { label: string }[] } | undefined)?.candidates ?? []).map((c) => c.label).sort();
    check("Cook County hospitals -> offers Georgia, Illinois, Minnesota", labels.join(",") === "Georgia,Illinois,Minnesota", `labels=${labels.join(",")}`);
  }

  // Batch 5B-5: DC and the territories are registered jurisdictions (entity-provider.ts STATES), so a territory, or a
  // city that exists only in one ("San Juan" is a city only in Puerto Rico), is answered with that territory's rows.
  // The negative control is a place that is not in the warehouse at all ("Atlantis" is a real Florida city, so it is
  // not used as one).
  console.log("\n2.3 - a territory is answered with its own rows; a place that is not a US jurisdiction stays refused");

  for (const [question, code] of [["hospitals in Guam", "GU"], ["hospitals in San Juan", "PR"], ["hospitals in Puerto Rico", "PR"], ["hospitals in the Virgin Islands", "VI"]] as const) {
    const { r, rows } = await ask(question);
    check(`${question} -> answered, every row in ${code}`, r.success === true && rows.length > 0 && rows.every((row) => row.state === code), `success=${r.success} rows=${rows.length}`);
  }
  for (const question of ["hospitals in Wakanda", "hospitals in Canada"]) {
    const { r, rows } = await ask(question);
    const noSql = (r.trace ?? []).every((gate) => gate.phase !== "deterministic-warehouse-execution");
    check(`${question} -> refused, no execution`, r.success === false && rows.length === 0 && noSql, `success=${r.success} rows=${rows.length}`);
  }

  console.log("\n2.5 - exact-literal informal city names");

  for (const question of ["hospitals in NYC", "hospitals in nyc", "hospitals in New York City"]) {
    const { r, rows, values } = await ask(question);
    check(
      `${question} -> city NEW YORK, state NY`,
      r.success === true && rows.length > 0 && values("city").size === 1 && values("city").has("NEW YORK") && values("state").has("NY") && values("state").size === 1,
      `cities=${[...values("city")].join(",")}`,
    );
  }
  {
    const { r, rows, values } = await ask("hospitals in New York");
    check("hospitals in New York (the state) is not narrowed to the city", r.success === true && values("city").size > 1, `cities=${values("city").size}`);
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
