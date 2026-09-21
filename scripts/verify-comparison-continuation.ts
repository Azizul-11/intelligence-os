#!/usr/bin/env tsx

/**
 * Comparison continuation (Layer 2, Turn 2) regression suite.
 *
 * The flow: Turn 1 `compare memorial hospital vs <a named hospital>` is ambiguous (Memorial Hospital exists in 12
 * places), the user picks a place, and Turn 2 must return BOTH hospitals with the full 22-field dossier. It has
 * regressed more than once, and no automated test covered it (verify-titlecase-and-acb-regression.ts says so in its own
 * header), so a change to the engine gates or to the Turn 2 wording broke it without a single suite going red.
 *
 * Default (in-process, deterministic, no LLM, read-only SELECTs): the REAL `continuationQuestion()` the orchestrator uses
 * builds the Turn 2 question, and the REAL runtime engine runs it with the same identity pins continuation.ts sends
 * (forcedIdentityCandidate, companionEntities, forcedIntent, identityAlreadyResolved).
 *
 * With `--live`: the same flows over HTTP against the deployed orchestrator (real pending interactions, real
 * continuation.ts, real LLM fallback). Run this after ANY change to the engine gates, the semantic pipeline or the
 * orchestrator's continuation code, and after each deploy.
 *
 * Usage: pnpm exec tsx scripts/verify-comparison-continuation.ts [--live]
 */
import "dotenv/config";

import { continuationQuestion } from "../supabase/functions/orchestrator/services/continuation-question";
import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { hospitalIdentityDirectory as DIRECTORY } from "../domain-packs/healthcare/src/runtime/hospital-identity-directory";
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

delete process.env.LLM_FIRST_FRONT_DOOR_ENABLED; // deterministic in-process run: no llmFallback is wired either

const LIVE = process.argv.includes("--live");
const FULL_DOSSIER_COLUMNS = 20; // the comparison dossier has 22 fields; anything short of 20 is the bare rating again

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

const memorialAt = (city: string) => DIRECTORY.find((r) => r.hospitalName === "MEMORIAL HOSPITAL" && r.city === city)!;
const byName = (name: string) => DIRECTORY.find((r) => r.hospitalName === name)!;

// ------------------------------------------------------------------------------------------ the Turn 2 wording
console.log("\nTurn 2 wording: continuationQuestion()");

const hospitalOption = { city: "CARTHAGE", state: "IL" };
const countyStateOption = { city: "Texas" }; // a state chosen for a county: the label is the state name, no `state` field

check(
  "a comparison of hospitals appends nothing (the place would land on the last named hospital)",
  continuationQuestion("compare memorial hospital vs CUERO REGIONAL HOSPITAL", hospitalOption, { isComparison: true, twoSlot: false }) ===
    "compare memorial hospital vs CUERO REGIONAL HOSPITAL",
);
check(
  "a two-slot reply appends nothing",
  continuationQuestion("Compare Memorial Hospital vs Memorial Hospital", hospitalOption, { isComparison: true, twoSlot: true }) ===
    "Compare Memorial Hospital vs Memorial Hospital",
);
check(
  "a single hospital keeps its place: Northwest Medical Center -> ... in TUCSON, AZ",
  continuationQuestion("Northwest Medical Center", { city: "TUCSON", state: "AZ" }, { isComparison: false, twoSlot: false }) ===
    "Northwest Medical Center in TUCSON, AZ",
);
check(
  "a state chosen for a county keeps its place, comparison or not",
  continuationQuestion("Show me hospitals in Houston County", countyStateOption, { isComparison: false, twoSlot: false }) ===
    "Show me hospitals in Houston County in Texas" &&
    continuationQuestion("compare Houston County vs Harris County", countyStateOption, { isComparison: true, twoSlot: false }) ===
      "compare Houston County vs Harris County in Texas",
);

// ------------------------------------------------------------------------------------------ the engine, in-process
async function inProcess() {
  const runtime = createDomainRuntime(healthcareDomain);
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
    semantic: createSemanticResolver(runtime.registry, runtime.entityProvider),
    planner: new QueryPlanner(),
    executionPlanMapper: new ExecutionPlanMapper(),
    executor,
    preprocessQuestion: expandUppercaseStateAbbreviations,
  });

  // Turn 1 -> the pins continuation.ts derives from the pending interaction (see its `companionEntities` block).
  async function turn1(question: string) {
    sql = 0;
    const t1: any = await engine.execute({ question });
    const offered = new Set((t1.answerability?.candidates ?? []).map((c: any) => c.value));
    const companions = (t1.semanticMatches ?? [])
      .filter((m: any) => m.semanticType === "entity" && m.resolvedValue && !offered.has(m.resolvedValue))
      .map((m: any) => ({ value: m.resolvedValue, canonicalKey: m.canonicalKey }));
    return { t1, companions, sqlAtTurn1: sql };
  }

  async function turn2(question: string, chosen: { facilityId: string; city: string; state: string }, companions: unknown[], appendPlace = false) {
    const text = appendPlace
      ? `${question} in ${chosen.city}, ${chosen.state}` // what continuation.ts sent before the fix: kept only to pin the engine gate
      : continuationQuestion(question, { city: chosen.city, state: chosen.state }, { isComparison: true, twoSlot: false });
    const r: any = await engine.execute({
      question: text,
      identityAlreadyResolved: true,
      forcedIdentityCandidate: { value: chosen.facilityId },
      forcedIntent: "comparison",
      companionEntities: companions,
    } as any);
    const rows = (r.rows ?? []) as Record<string, unknown>[];
    return { r, rows, text };
  }

  // The reported case first, then the documented ones, then the names that end in "hospital".
  const PARTNERS: [string, string][] = [
    ["CUERO REGIONAL HOSPITAL", "450597"],
    ["Mayo Clinic", "100151"],
    ["Cleveland Clinic", ""],
    ["Mayo Clinic Hospital", "030103"],
    ["Houston Methodist Hospital", "450358"],
  ];
  const PLACES = ["CARTHAGE", "GONZALES", "BELLEVILLE"];

  console.log("\nTurn 2 in the engine: both hospitals, full dossier (no place appended)");
  for (const [partner, partnerId] of PARTNERS) {
    const question = `compare memorial hospital vs ${partner}`;
    const { t1, companions, sqlAtTurn1 } = await turn1(question);
    check(
      `Turn 1 "${question}" clarifies which Memorial Hospital, 0 SQL, and keeps the partner as a companion`,
      t1.answerability?.reason === "identity-ambiguous" && sqlAtTurn1 === 0 && companions.length === 1 && (!partnerId || companions[0].value === partnerId),
      `${t1.answerability?.reason} sql=${sqlAtTurn1} companions=${companions.length}`,
    );
    for (const city of PLACES) {
      const chosen = memorialAt(city);
      const { r, rows, text } = await turn2(question, chosen, companions);
      const ids = new Set(rows.map((row) => String(row.facility_id)));
      check(
        `  ... reply ${city}: 2 rows, both facilities, ${FULL_DOSSIER_COLUMNS}+ columns`,
        r.success === true && rows.length === 2 && ids.has(chosen.facilityId) && ids.has(String(companions[0].value)) && Object.keys(rows[0] ?? {}).length >= FULL_DOSSIER_COLUMNS,
        `success=${r.success} reason=${r.answerability?.reason} rows=${rows.length} columns=${Object.keys(rows[0] ?? {}).length} text="${text}"`,
      );
    }
  }

  console.log("\nTurn 2 in the engine: the hospital is in the other position");
  {
    const question = "compare CUERO REGIONAL HOSPITAL vs memorial hospital";
    const { companions } = await turn1(question);
    const chosen = memorialAt("CARTHAGE");
    const { r, rows } = await turn2(question, chosen, companions);
    check("compare CUERO REGIONAL HOSPITAL vs memorial hospital -> CARTHAGE: 2 rows, full dossier", r.success === true && rows.length === 2 && Object.keys(rows[0] ?? {}).length >= FULL_DOSSIER_COLUMNS);
  }

  console.log("\nTurn 2 in the engine: the gate that broke it (identities pinned by value are never 'not found')");
  {
    // The Batch 4 "hospital not found in that place" gate read the appended place as a qualifier of the LAST named
    // hospital and refused the whole Turn 2. A request whose identities are pinned by value must never be refused for that.
    const question = "compare memorial hospital vs Mayo Clinic";
    const { companions } = await turn1(question);
    const chosen = memorialAt("CARTHAGE");
    const { r, rows, text } = await turn2(question, chosen, companions, true);
    check(
      `even with the place appended ("${text}") the pinned Turn 2 is not refused as "not found": 2 rows`,
      r.success === true && rows.length === 2 && r.answerability?.reason !== "data-unavailable",
      `success=${r.success} reason=${r.answerability?.reason} rows=${rows.length}`,
    );
    const plain = await engine.execute({ question: "Memorial Hospital in Alabama overall rating" } as any);
    check("Turn 1 still refuses a hospital that does not exist in the named place (Memorial Hospital in Alabama)", (plain as any).answerability?.reason === "data-unavailable" && (plain as any).success === false);
  }

  console.log("\nTurn 2 in the engine: the two-slot reply (ABILENE and GONZALES)");
  {
    const question = "Compare Memorial Hospital vs Memorial Hospital";
    const abilene = memorialAt("ABILENE");
    const gonzales = memorialAt("GONZALES");
    const text = continuationQuestion(question, { city: abilene.city, state: abilene.state }, { isComparison: true, twoSlot: true });
    const r: any = await engine.execute({
      question: text,
      identityAlreadyResolved: true,
      forcedIdentityCandidate: { value: abilene.facilityId },
      forcedIntent: "comparison",
      companionEntities: [{ canonicalKey: "hospital", value: gonzales.facilityId }],
    } as any);
    const ids = new Set(((r.rows ?? []) as any[]).map((row) => String(row.facility_id)));
    check("ABILENE and GONZALES -> the two Memorial Hospitals", r.success === true && ids.size === 2 && ids.has(abilene.facilityId) && ids.has(gonzales.facilityId), `success=${r.success} reason=${r.answerability?.reason}`);
  }
}

// ------------------------------------------------------------------------------------------ live, over HTTP
async function live() {
  const url = `${env.supabaseUrl.replace(/\/$/, "")}/functions/v1/orchestrator`;
  const call = async (body: Record<string, unknown>) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: env.supabaseAnonKey, Authorization: `Bearer ${env.supabaseAnonKey}` },
      body: JSON.stringify({ domain: "healthcare", ...body }),
    });
    const d: any = await res.json();
    let rows: Record<string, unknown>[] = [];
    try {
      const parsed = JSON.parse(d.answer);
      if (Array.isArray(parsed)) rows = parsed;
    } catch {
      /* not a table */
    }
    return { d, rows };
  };

  console.log("\nLIVE (deployed function, real pending interactions): Turn 1 -> reply -> both hospitals, full dossier");
  const FLOWS: [string, string, string, string][] = [
    ["compare memorial hospital vs CUERO REGIONAL HOSPITAL", "CARTHAGE", "141305", "450597"], // the reported case
    ["compare memorial hospital vs CUERO REGIONAL HOSPITAL", "GONZALES", "450235", "450597"],
    ["compare memorial hospital vs Mayo Clinic", "CARTHAGE", "141305", "100151"], // documented in the titlecase suite header
    ["compare memorial hospital vs Cleveland Clinic", "BELLEVILLE", "", ""],
    ["compare memorial hospital vs Mayo Clinic Hospital", "CARTHAGE", "141305", "030103"],
  ];
  for (const [question, reply, idA, idB] of FLOWS) {
    const { d: t1 } = await call({ question });
    const pending = t1.pendingInteractionId as string | undefined;
    check(`Turn 1 "${question}" -> clarification with a pending interaction`, t1.answerability?.status === "ambiguous" && !!pending, `${t1.answerability?.status} pending=${!!pending}`);
    if (!pending) continue;
    const { d, rows } = await call({ question: reply, pendingInteractionId: pending, continuationResponse: reply });
    const ids = new Set(rows.map((row) => String(row.facility_id)));
    const idsOk = idA && idB ? ids.has(idA) && ids.has(idB) : ids.size === 2;
    check(
      `  ... reply ${reply}: 2 rows, both hospitals, ${FULL_DOSSIER_COLUMNS}+ columns, no model rewrite`,
      d.success === true && rows.length === 2 && idsOk && Object.keys(rows[0] ?? {}).length >= FULL_DOSSIER_COLUMNS,
      `success=${d.success} rows=${rows.length} columns=${Object.keys(rows[0] ?? {}).length} ids=${[...ids].join("/")} err=${String(d.error ?? "").slice(0, 80)}`,
    );
    const normalizerCalls = (d.llmCalls ?? []).filter((c: any) => c.role === "normalizer").length;
    check(`  ... reply ${reply}: answered deterministically (0 normalizer calls)`, normalizerCalls === 0, `normalizer calls=${normalizerCalls}`);
  }

  console.log("\nLIVE controls that must not move");
  {
    const { d: t1 } = await call({ question: "Compare Memorial Hospital vs Memorial Hospital" });
    const { d, rows } = await call({ question: "ABILENE and GONZALES", pendingInteractionId: t1.pendingInteractionId, continuationResponse: "ABILENE and GONZALES" });
    check("two-slot reply ABILENE and GONZALES -> 2 rows", d.success === true && rows.length === 2, `success=${d.success} rows=${rows.length}`);
  }
  {
    const { d: t1 } = await call({ question: "Northwest Medical Center" });
    const { d, rows } = await call({ question: "TUCSON, AZ", pendingInteractionId: t1.pendingInteractionId, continuationResponse: "TUCSON, AZ" });
    check("single hospital: Northwest Medical Center -> TUCSON, AZ -> the Tucson facility (030085)", d.success === true && rows.some((row) => String(row.facility_id) === "030085"), `success=${d.success} rows=${rows.length}`);
  }
  {
    const { d: t1 } = await call({ question: "show me 5 star hospitals" });
    const { d, rows } = await call({ question: "Texas", pendingInteractionId: t1.pendingInteractionId, continuationResponse: "Texas" });
    check("star rating without a state -> Texas -> Texas 5-star hospitals", d.success === true && rows.length > 0 && rows.every((row) => row.state === "TX"), `success=${d.success} rows=${rows.length}`);
  }
}

(async () => {
  await inProcess();
  if (LIVE) await live();
  else console.log("\n(in-process only; run with --live to also drive the deployed function)");
})()
  .catch((error) => {
    failed++;
    console.log(`  [FAIL] suite crashed - ${error instanceof Error ? error.message : String(error)}`);
  })
  .finally(() => {
    console.log("\n" + "=".repeat(60));
    console.log(`RESULT: ${passed} passed, ${failed} failed (${passed + failed} total)`);
    process.exit(failed > 0 ? 1 : 0);
  });
