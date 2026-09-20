#!/usr/bin/env tsx

/**
 * Batch 1 (word-drop and discarded-refusal guards) verification.
 *
 *   Step 1.1  Layer 0 whole-utterance classifier (services/conversational.ts)
 *   Step 1.2  unaccounted-word gate on an LLM-rewritten question (QueryPlanner.findUnaccountedWords + engine)
 *   Step 1.3  LLM decline contract (services/normalizer-hook.ts, engine hook shape, trace detail, catalog topics)
 *
 * The engine checks use a scripted `llmFallback` (no LLM call) against the live warehouse (read-only SELECTs).
 *
 * Usage: pnpm exec tsx scripts/verify-batch1-word-drop-guards.ts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { isConversational } from "../supabase/functions/orchestrator/services/conversational";
import { mapNormalizerResult } from "../supabase/functions/orchestrator/services/normalizer-hook";
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

// ------------------------------------------------------------------------------------------ Step 1.1
console.log("\nStep 1.1 - Layer 0 whole-utterance classifier");

const CONVERSATIONAL = [
  "hi",
  "Hello!",
  "hey there",
  "what can you do",
  "What can you do for me?",
  "hey what can you help me with?",
  "thank you, that was helpful",
  "thanks!",
  "bye",
  "help",
  "help me",
  "who are you?",
  "how do you work?",
  "explain yourself",
];
for (const q of CONVERSATIONAL) check(`conversational: ${JSON.stringify(q)}`, isConversational(q));

const ANALYTICAL = [
  "hi show me hospitals in HI",
  "hello best hospitals in texas",
  "help me find the safest hospitals in Texas",
  "what is this hospital's rating",
  "what can you tell me about Mayo Clinic",
  "who are the best hospitals in Ohio",
  "thanks now show me hospitals in Ohio",
  "hey which hospitals in Texas have the lowest mortality",
];
for (const q of ANALYTICAL) check(`falls through to the pipeline: ${JSON.stringify(q)}`, !isConversational(q));

// Catalog-wide: exactly the four conversational catalog rows may be swallowed by Layer 0.
const catalog = JSON.parse(readFileSync(resolve("docs/LLM-FIRST-FRONT/DogfoodingV1/500_DOGFOODING_QUERY_CATALOG.json"), "utf-8")) as { id: string; query: string }[];
const swallowed = catalog.filter((r) => isConversational(r.query)).map((r) => r.id).sort();
check(
  "catalog: only F012-F015 are conversational (C048 `hi show me hospitals in HI` is analytical)",
  JSON.stringify(swallowed) === JSON.stringify(["F012", "F013", "F014", "F015"]),
  `swallowed: ${swallowed.join(",")}`,
);

// ------------------------------------------------------------------------------------------ Step 1.3 (hook + catalog)
console.log("\nStep 1.3a - normalizer result -> hook shape (services/normalizer-hook.ts)");

const prov = { provider: "test", model: "m", keyId: "k", attempts: 1, latencyMs: 1, tiers: "k", fallbackUsed: false };
const cat = { unsupportedTopics: ["stroke", "nurse communication", "since", "psi"] };

let h = mapNormalizerResult({ status: "fallback", unsupported_terms: ["stroke"], provenance: prov }, cat) as any;
check("fallback + a term naming a listed topic is a binding decline", Array.isArray(h?.unsupportedTerms) && h.unsupportedTerms[0] === "stroke" && h.meta?.provider === "test");
h = mapNormalizerResult({ status: "ok", canonical_question: "Show me hospitals with lowest Mortality Rate", unsupported_terms: ["stroke"], provenance: prov }, cat) as any;
check("ok + a listed topic is binding too (the rewrite dropped what the user asked for)", Array.isArray(h?.unsupportedTerms) && !("canonicalQuestion" in h));
h = mapNormalizerResult({ status: "ok", canonical_question: "Show me hospitals in Ohio", unsupported_terms: ["better-rated"], provenance: prov }, cat) as any;
check("ok + a term that names no listed topic stays a plain rewrite", h?.canonicalQuestion === "Show me hospitals in Ohio" && !("unsupportedTerms" in h));
h = mapNormalizerResult({ status: "fallback", unsupported_terms: ["Nurse Communication scores", "generally"], provenance: prov }, cat) as any;
check("only the corroborated terms are kept, case-insensitively", JSON.stringify(h?.unsupportedTerms) === JSON.stringify(["Nurse Communication scores"]));
h = mapNormalizerResult({ status: "fallback", unsupported_terms: ["state-by-state view", "better-rated"], provenance: prov }, cat) as any;
check("terms that name no listed topic are NOT binding (the pipeline still gets its turn)", h && !("unsupportedTerms" in h) && !!h.meta);
h = mapNormalizerResult({ status: "fallback", unsupported_terms: ["stroke"], provenance: prov }) as any;
check("without a topic catalog nothing is binding", h && !("unsupportedTerms" in h));
h = mapNormalizerResult({ status: "fallback", unsupported_terms: ["psychiatrist", "essential care"], provenance: prov }, cat) as any;
check("word boundaries: `psychiatrist` / `essential` do not match `psychiatric` / `psi`", h && !("unsupportedTerms" in h));
h = mapNormalizerResult({ status: "fallback", provenance: prov }, cat) as any;
check("fallback without the field behaves as before (no usable answer)", h && !("unsupportedTerms" in h) && !("canonicalQuestion" in h));
h = mapNormalizerResult({ status: "ok", canonical_question: "Show me hospitals in Ohio", provenance: prov }, cat) as any;
check("ok maps to a canonical rewrite", h?.canonicalQuestion === "Show me hospitals in Ohio");
h = mapNormalizerResult({ status: "need_clarification", reason: "Which state should I look in?", provenance: prov }, cat) as any;
check("need_clarification maps to a clarification", h?.clarification === "Which state should I look in?");
check("gateway failure with no provenance maps to null", mapNormalizerResult({ status: "fallback" }, cat) === null);

console.log("\nStep 1.3b - the domain catalog lists unsupported topics, derived");
const topics = DOMAIN_CAPABILITIES.unsupportedTopics;
check("derived from concepts with no measure: stroke, sepsis", topics.includes("stroke") && topics.includes("sepsis"), topics.slice(0, 6).join(","));
check("known gaps are listed (nurse communication, emergency services, psi)", ["nurse communication", "emergency services", "psi"].every((t) => topics.includes(t)));
check("supported vocabulary is never listed (patient satisfaction, mortality, readmission, safety, overall rating)", !["patient satisfaction", "mortality", "readmission", "safety", "overall rating"].some((t) => topics.includes(t)));

// ------------------------------------------------------------------------------------------ engine (Steps 1.2 and 1.3)
console.log("\nSteps 1.2 / 1.3 - engine with a scripted normalizer (live warehouse, read-only)");

const runtime = createDomainRuntime(healthcareDomain);
function makeEngine(hook: (q: string) => Promise<any>) {
  return createRuntimeEngine({
    runtime,
    semantic: createSemanticResolver(runtime.registry, runtime.entityProvider),
    planner: new QueryPlanner(),
    executionPlanMapper: new ExecutionPlanMapper(),
    executor: new SqlExecutor(new SupabaseDatabaseAdapter(createClient(env.supabaseUrl, env.supabaseServiceRoleKey))),
    preprocessQuestion: expandUppercaseStateAbbreviations,
    llmFallback: hook,
  });
}
const realLog = console.log;
async function run(question: string, hook: (q: string) => Promise<any>) {
  console.log = () => {}; // the engine prints every gate
  try {
    return await makeEngine(hook).execute({ question });
  } finally {
    console.log = realLog;
  }
}
const gate = (r: any, phase: string) => (r.trace ?? []).find((t: any) => t.phase === phase && t.status !== "enter");
const ranSql = (r: any) => (r.trace ?? []).some((t: any) => t.phase === "deterministic-warehouse-execution");

async function engineChecks() {
// 1.3: a binding decline is refused with 0 SQL and shows what the LLM could not map
let r = await run("stroke mortality", async () => ({ unsupportedTerms: ["stroke"], meta: prov }));
check("binding decline: refused, semantic-incomplete, no rows", !r.success && r.answerability?.reason === "semantic-incomplete" && r.rowCount === 0);
check("binding decline: 0 SQL (the warehouse gate is never entered)", !ranSql(r));
check("binding decline: trace `llm-normalization` = unsupported with the terms and the tier", gate(r, "llm-normalization")?.status === "unsupported" && gate(r, "llm-normalization")?.detail?.unsupportedTerms === "stroke" && gate(r, "llm-normalization")?.detail?.provider === "test");

// 1.3: a decline that names nothing keeps today's behaviour (C071 / D058 depend on it). Batch 3: "rated" is understood on
// the first pass now, so C071 no longer reaches the LLM front door at all; D058 still does and still needs this.
r = await run("I want a state-by-state view of the top hospitals", async () => ({ meta: prov }));
check("decline without terms: the deterministic pipeline still answers", r.success && r.rowCount > 0, `success=${r.success} rows=${r.rowCount}`);
check("decline without terms: trace status stays `unavailable`", gate(r, "llm-normalization")?.status === "unavailable");

// D3: the trace records what the question was rewritten to
r = await run("hospitals in oh", async () => ({ canonicalQuestion: "Show me hospitals in Ohio", meta: prov }));
check("rewrite: answered", r.success && r.rowCount > 0, `success=${r.success} rows=${r.rowCount}`);
check("rewrite: trace `llm-normalization` = rewritten with canonicalQuestion and the tier", gate(r, "llm-normalization")?.status === "rewritten" && gate(r, "llm-normalization")?.detail?.canonicalQuestion === "Show me hospitals in Ohio" && gate(r, "llm-normalization")?.detail?.provider === "test");

// 1.2: a word the user typed that survives the rewrite unresolved is refused
r = await run("hospitals in Washington DC", async () => ({ canonicalQuestion: "Show me hospitals in Washington, DC", meta: prov }));
check("guard: `DC` kept by the rewrite and resolved by nothing is refused, 0 SQL", !r.success && r.answerability?.reason === "semantic-incomplete" && !ranSql(r));
check("guard: trace names the word", gate(r, "unaccounted-word-guard")?.detail?.unaccountedWords === "dc", JSON.stringify(gate(r, "unaccounted-word-guard")?.detail));

// 1.2: a word the rewrite itself introduced is ignored
r = await run("hospitals with good hip and knee readmission performance", async () => ({ canonicalQuestion: "Show me hospitals with lowest Readmission Rate for Elective Primary Hip/Knee Arthroplasty", meta: prov }));
check("guard: words introduced by the rewrite (a concept display name) do not refuse a correct answer", r.success && r.rowCount > 0 && !gate(r, "unaccounted-word-guard"), `success=${r.success} rows=${r.rowCount}`);

// 1.2: typo fixed by the rewrite
r = await run("hospitals with best safty performence", async () => ({ canonicalQuestion: "Show me hospitals with best Safety Performance", meta: prov }));
check("guard: typos corrected by the rewrite are not `dropped` words", r.success && r.rowCount > 0, `success=${r.success} rows=${r.rowCount}`);

// 1.2: scoped to the rewritten run - a first pass (LLM unavailable) is unchanged
r = await run("hospitals in Texas actually", async () => null);
check("guard is inert on a first pass: an extra harmless word still answers", r.success && r.rowCount > 0, `success=${r.success} rows=${r.rowCount}`);
}

engineChecks()
  .catch((error) => {
    failed++;
    console.log(`  [FAIL] engine checks threw - ${error instanceof Error ? error.message : String(error)}`);
  })
  .finally(() => {
    console.log("\n" + "=".repeat(80));
    console.log(`RESULT: ${passed} passed, ${failed} failed (${passed + failed} total)`);
    console.log("=".repeat(80));
    process.exit(failed > 0 ? 1 : 0);
  });
