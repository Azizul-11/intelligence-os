/**
 * R7 (2026-09-18) - paid LLM (AICredits) first for the question-rewrite / intent
 * role ONLY: qwen/qwen3.7-flash (reasoning off) -> qwen/qwen3-30b-a3b-instruct-2507
 * -> the unchanged free chain. The answering tier is recorded in the trace.
 * Summaries, suggestions and conversational replies never touch the paid tiers.
 *
 * Sections
 *  A. Config, wiring and secrets            (no network cost)
 *  B. Live gateway calls + latency sample   (real AICredits calls, ~INR 0.003 each)
 *  C. Engine end to end, flag ON            (real DB + real paid LLM; the frontend probes)
 *  D. State-code variants                   (deterministic + LLM-assisted)
 *  E. Stubbed-fetch proofs                  (no cost; run LAST - they touch the shared
 *                                            per-tier circuit breakers)
 *
 * Run: npx tsx scripts/verify-paid-normalizer-aicredits.ts
 */
process.env.LLM_FIRST_FRONT_DOOR_ENABLED = "true";

import "dotenv/config";

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { DOMAIN_CAPABILITIES } from "../domain-packs/healthcare/src/runtime/capability-catalog";
import { expandUppercaseStateAbbreviations } from "../domain-packs/healthcare/src/runtime/state-abbreviation-preprocessor";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { SqlExecutor } from "../packages/sql-executor/src/sql-executor";
import { SupabaseDatabaseAdapter } from "../packages/sql-executor/src/supabase-database-adapter";
import {
  AICREDITS_NORMALIZER_TIERS,
  AICREDITS_QWEN_30B_TIER,
  AICREDITS_QWEN_FLASH_TIER,
  FALLBACK_CHAIN,
  LLMModelGateway,
  NORMALIZER_CHAIN,
  llmGateway,
} from "../packages/llm-model-gateway/src/llm-model-gateway";
import { env } from "./shared/env";

const FLASH_MODEL = "qwen/qwen3.7-flash";
const FLASH_KEY_ID = "aicredits-qwen3.7-flash";
const SECOND_MODEL = "qwen/qwen3-30b-a3b-instruct-2507";
const SECOND_KEY_ID = "aicredits-qwen3-30b-a3b";

let pass = 0;
let fail = 0;
function check(id: string, label: string, condition: boolean, detail: string) {
  if (condition) {
    pass++;
    console.log(`  [PASS] ${id} ${label}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${id} ${label} -- ${detail}`);
  }
}

// Mirror of supabase/functions/orchestrator/services/domain-registry.ts's
// llmFallback adapter (Deno - cannot be imported under Node): same mapping,
// including the R7 `meta` (provenance) pass-through.
let llmCalls = 0;
async function llmFallback(question: string) {
  llmCalls++;
  const result = await llmGateway.normalizeMessyLanguage(question, DOMAIN_CAPABILITIES);
  const meta = result.provenance ? { meta: { ...result.provenance } } : {};
  if (result.status === "ok" && result.canonical_question) {
    return { canonicalQuestion: result.canonical_question, ...meta };
  }
  if (result.status === "need_clarification" && result.reason) {
    return { clarification: result.reason, ...meta };
  }
  return result.provenance ? { meta: { ...result.provenance } } : null;
}

function makeEngine(executorOverride?: unknown) {
  const runtime = createDomainRuntime(healthcareDomain);
  const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
  const executor =
    executorOverride ??
    new SqlExecutor(new SupabaseDatabaseAdapter(createClient(env.supabaseUrl, env.supabaseServiceRoleKey)));
  return createRuntimeEngine({
    runtime,
    semantic,
    planner: new QueryPlanner(),
    executionPlanMapper: new ExecutionPlanMapper(),
    executor: executor as any,
    preprocessQuestion: expandUppercaseStateAbbreviations,
    llmFallback,
  });
}

function makeSpyEngine(spy: { callCount: number }) {
  return makeEngine({
    async execute() {
      spy.callCount++;
      return { success: true, rows: [{ facility_id: "mock", value: 5 }], rowCount: 1 };
    },
  });
}

const rowsOf = (r: { rows?: unknown }) => (r.rows as Record<string, unknown>[]) ?? [];
const cityOf = (row: Record<string, unknown>) => String(row["city"] ?? "").toUpperCase();
const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.round(p * (sorted.length - 1)))]!;
function normalizationGate(trace: { phase: string; status: string; detail?: Record<string, unknown> }[] | undefined) {
  return (trace ?? []).find((g) => g.phase === "llm-normalization" && g.status !== "enter");
}

async function main() {
  console.log("=".repeat(100));
  console.log("PAID NORMALIZER (AICredits: qwen3.7-flash -> qwen3-30b-a3b -> free chain) - VERIFICATION - flag=ON");
  console.log("=".repeat(100));

  // -------------------------------------------------------------------------
  console.log("\n--- A. Config, wiring and secrets (no network cost) ---");
  const key = process.env.ZAI_API_KEY ?? "";
  check("A1", "tier 1 = aicredits / qwen3.7-flash, reasoning OFF via extraBody, JSON mode, 3 s, NO retry, own circuit, not free",
    AICREDITS_QWEN_FLASH_TIER.provider === "aicredits" &&
      AICREDITS_QWEN_FLASH_TIER.model === FLASH_MODEL &&
      AICREDITS_QWEN_FLASH_TIER.baseURL === "https://api.aicredits.in/v1" &&
      AICREDITS_QWEN_FLASH_TIER.keyId === FLASH_KEY_ID &&
      AICREDITS_QWEN_FLASH_TIER.circuitKey === FLASH_KEY_ID &&
      AICREDITS_QWEN_FLASH_TIER.supportsJsonMode === true &&
      JSON.stringify(AICREDITS_QWEN_FLASH_TIER.extraBody) === JSON.stringify({ reasoning: { enabled: false } }) &&
      AICREDITS_QWEN_FLASH_TIER.timeoutMs === 3000 &&
      AICREDITS_QWEN_FLASH_TIER.maxRetries === 0 &&
      AICREDITS_QWEN_FLASH_TIER.isFree === false,
    JSON.stringify({ ...AICREDITS_QWEN_FLASH_TIER, apiKey: AICREDITS_QWEN_FLASH_TIER.apiKey ? "<set>" : "<unset>" }));
  check("A2", "tier 2 = aicredits / qwen3-30b-a3b-instruct-2507, JSON mode, 4 s, NO retry, own circuit, no extraBody",
    AICREDITS_QWEN_30B_TIER.provider === "aicredits" &&
      AICREDITS_QWEN_30B_TIER.model === SECOND_MODEL &&
      AICREDITS_QWEN_30B_TIER.keyId === SECOND_KEY_ID &&
      AICREDITS_QWEN_30B_TIER.circuitKey === SECOND_KEY_ID &&
      AICREDITS_QWEN_30B_TIER.supportsJsonMode === true &&
      AICREDITS_QWEN_30B_TIER.extraBody === undefined &&
      AICREDITS_QWEN_30B_TIER.timeoutMs === 4000 &&
      AICREDITS_QWEN_30B_TIER.maxRetries === 0,
    JSON.stringify({ ...AICREDITS_QWEN_30B_TIER, apiKey: AICREDITS_QWEN_30B_TIER.apiKey ? "<set>" : "<unset>" }));
  check("A3", "the key is read from env var ZAI_API_KEY by both tiers (present, never printed)",
    key.length > 0 && AICREDITS_QWEN_FLASH_TIER.apiKey === key && AICREDITS_QWEN_30B_TIER.apiKey === key, `envKeyPresent=${key.length > 0}`);
  check("A4", "rewrite chain = [qwen3.7-flash, qwen3-30b-a3b, ...the unchanged free chain, same order]",
    NORMALIZER_CHAIN[0] === AICREDITS_QWEN_FLASH_TIER && NORMALIZER_CHAIN[1] === AICREDITS_QWEN_30B_TIER &&
      NORMALIZER_CHAIN.slice(2).map((t) => t.keyId).join(",") === FALLBACK_CHAIN.map((t) => t.keyId).join(","),
    NORMALIZER_CHAIN.map((t) => t.keyId).join(","));
  check("A5", "the paid tiers are NOT in FALLBACK_CHAIN (suggestions / summary / conversational can never spend them)",
    !FALLBACK_CHAIN.some((t) => t.provider === "aicredits") && AICREDITS_NORMALIZER_TIERS.length === 2, "aicredits found in FALLBACK_CHAIN");
  check("A6", "the default gateway routes: every role -> FALLBACK_CHAIN, rewrite -> NORMALIZER_CHAIN",
    (llmGateway as any).chain === FALLBACK_CHAIN && (llmGateway as any).rewriteChain === NORMALIZER_CHAIN, "singleton wiring differs");

  const scanned = [
    "packages/llm-model-gateway/src/llm-model-gateway.ts",
    "packages/llm-model-gateway/edge/index.js",
    "packages/runtime-engine/edge/index.js",
    "supabase/functions/orchestrator/services/domain-registry.ts",
    "scripts/verify-paid-normalizer-aicredits.ts",
  ].filter((f) => existsSync(f));
  const leaked = scanned.filter((f) => key.length > 0 && readFileSync(f, "utf8").includes(key));
  const keyShaped = scanned.filter((f) => /sk-[0-9a-f]{40,}/i.test(readFileSync(f, "utf8")));
  check("A7", `no secret in ${scanned.length} source/bundle files (actual key value not found, no sk-<hex> literal)`, leaked.length === 0 && keyShaped.length === 0, `leaked=${leaked} keyShaped=${keyShaped}`);

  {
    const catalog = (await (await fetch("https://api.aicredits.in/api/models")).json()) as { data?: { id: string; is_active?: boolean }[] };
    const list = catalog.data ?? [];
    const found = [FLASH_MODEL, SECOND_MODEL].map((id) => list.find((m) => m.id === id));
    check("A8", "both models are in the public AICredits catalog and active", found.every((m) => !!m && m.is_active !== false), `catalogEntries=${list.length}`);
  }

  // -------------------------------------------------------------------------
  console.log("\n--- B. Live gateway calls (real AICredits) ---");
  {
    const r = await llmGateway.normalizeMessyLanguage("show me hospital for heart pain Houston Texas", DOMAIN_CAPABILITIES);
    const p = r.provenance;
    console.log(`    [B1] ${JSON.stringify({ status: r.status, canonical: r.canonical_question, provenance: p })}`);
    check("B1", "heart pain Houston Texas -> answered by a paid Qwen tier, canonical = AMI mortality in Houston, Texas",
      r.status === "ok" && p?.provider === "aicredits" && [FLASH_MODEL, SECOND_MODEL].includes(p.model) &&
        /Acute Myocardial Infarction in Houston, Texas$/.test(r.canonical_question ?? ""),
      JSON.stringify(r));
    check("B2", "that single call returned in under 5 s (the p50 below is the real latency figure)", (p?.latencyMs ?? 1e9) < 5000, `latencyMs=${p?.latencyMs}`);
  }
  {
    // Reasoning must really be off on the live endpoint: with it on, this model
    // spends 100-250 reasoning tokens and ~10 s. Raw call, same body the tier builds.
    // Up to 3 tries: the upstream answers 429 on a few percent of calls (that is
    // why the tier has a fallback); a 429 says nothing about reasoning.
    let outcome = "no successful response in 3 tries";
    let zeroReasoning = false;
    for (let attempt = 0; attempt < 3 && !zeroReasoning; attempt++) {
      const res = await fetch(`${AICREDITS_QWEN_FLASH_TIER.baseURL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          ...AICREDITS_QWEN_FLASH_TIER.extraBody,
          model: FLASH_MODEL,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: 'Return {"ok": true} as JSON.' }, { role: "user", content: "go" }],
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { usage?: { completion_tokens_details?: { reasoning_tokens?: number } } };
      if (res.ok) {
        const reasoningTokens = body.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
        zeroReasoning = reasoningTokens === 0;
        outcome = `http=200 reasoning_tokens=${reasoningTokens}`;
      } else {
        outcome = `http=${res.status}`;
      }
    }
    check("B3", "live check: with the tier's extraBody, qwen3.7-flash uses ZERO reasoning tokens", zeroReasoning, outcome);
  }
  {
    const sample = [
      "goverment hospital in CA", "show me hospital Houson Texas", "best hospital for heart pain Houston", "show me hospital for heart pain",
      "hospitals in oh", "good saftey", "heart attack death rate", "my chest hurts need good hospital", "Texs hospitals", "Calfornia hospitals",
      "safest hosptials", "bypass surgery readmission", "hospitals in Az", "non profit hospital in tx", "worst hospitals for heart attack",
      "show me best heart care hospital", "what's the weather in Dallas?", "top hospitals in California", "hospitals in philly", "Show me hospitals in Texas",
    ];
    const ms: number[] = [];
    let viaFlash = 0;
    let viaSecond = 0;
    let usable = 0;
    for (const q of sample) {
      const r = await llmGateway.normalizeMessyLanguage(q, DOMAIN_CAPABILITIES);
      ms.push(r.provenance?.latencyMs ?? 0);
      if (r.provenance?.keyId === FLASH_KEY_ID) viaFlash++;
      if (r.provenance?.keyId === SECOND_KEY_ID) viaSecond++;
      if (r.reason !== "LLM gateway unavailable" && r.reason !== "malformed gateway response") usable++;
    }
    ms.sort((a, b) => a - b);
    console.log(`    [B4] ${sample.length} calls: latency ms  min=${ms[0]}  p50=${pct(ms, 0.5)}  p95=${pct(ms, 0.95)}  max=${ms[ms.length - 1]}  | answered by flash=${viaFlash} second tier=${viaSecond} free/none=${sample.length - viaFlash - viaSecond}`);
    check("B4", `all ${sample.length} sampled rewrites answered by a PAID tier and usable (none fell to the free chain or came back malformed)`, viaFlash + viaSecond === sample.length && usable === sample.length, `flash=${viaFlash} second=${viaSecond} usable=${usable}`);
    check("B5", "latency p50 <= 2,000 ms and p95 <= 4,500 ms (measured; the two-tier cutoffs are 3 s + 4 s)", pct(ms, 0.5) <= 2000 && pct(ms, 0.95) <= 4500, `p50=${pct(ms, 0.5)} p95=${pct(ms, 0.95)}`);
  }

  // -------------------------------------------------------------------------
  console.log("\n--- C. Engine end to end, flag ON, real DB + real paid LLM ---");
  const engine = makeEngine();
  {
    const r = await engine.execute({ question: "best hospital for heart pain Houston Texas" });
    const rows = rowsOf(r);
    const codes = [...new Set(rows.map((x) => x["measure_code"]))];
    check("C1", "best hospital for heart pain Houston Texas -> 10 rows, all HOUSTON TX, MORT_30_AMI (metric kept, not Overall Rating)",
      r.success === true && rows.length === 10 && rows.every((x) => cityOf(x) === "HOUSTON" && x["state"] === "TX") && codes.length === 1 && codes[0] === "MORT_30_AMI",
      `success=${r.success} rows=${rows.length} codes=${JSON.stringify(codes)}`);
    const gate = normalizationGate(r.trace as any);
    const d = gate?.detail as Record<string, unknown> | undefined;
    console.log(`    [C1] llm-normalization gate: ${JSON.stringify(gate)}`);
    check("C2", "the trace records WHICH tier answered: aicredits, a Qwen model, attempts>=1, latencyMs, tiers start with the flash tier",
      gate?.status === "rewritten" && d?.provider === "aicredits" && [FLASH_MODEL, SECOND_MODEL].includes(String(d?.model)) &&
        [FLASH_KEY_ID, SECOND_KEY_ID].includes(String(d?.keyId)) && typeof d?.attempts === "number" && (d.attempts as number) >= 1 &&
        typeof d?.latencyMs === "number" && String(d?.tiers).startsWith(FLASH_KEY_ID) && typeof d?.fallbackUsed === "boolean",
      JSON.stringify(gate));
  }
  {
    const r = await engine.execute({ question: "show me hospital Houson Texas" });
    check("C3", '"show me hospital Houson Texas" (typo, no "in") -> 28 rows, all HOUSTON TX', r.success === true && r.rowCount === 28 && rowsOf(r).every((x) => cityOf(x) === "HOUSTON" && x["state"] === "TX"), `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "show me hospital in Houson Texas" });
    check("C4", '"show me hospital in Houson Texas" -> 28 rows, all HOUSTON TX', r.success === true && r.rowCount === 28 && rowsOf(r).every((x) => cityOf(x) === "HOUSTON"), `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "show me hospital for heart pain" });
    const codes = [...new Set(rowsOf(r).map((x) => x["measure_code"]))];
    check("C5", '"show me hospital for heart pain" -> 10 nationwide rows, MORT_30_AMI', r.success === true && r.rowCount === 10 && codes.length === 1 && codes[0] === "MORT_30_AMI", `success=${r.success} rowCount=${r.rowCount} codes=${JSON.stringify(codes)}`);
  }
  {
    const spy = { callCount: 0 };
    const r = await makeSpyEngine(spy).execute({ question: "best hospital for heart pain Houston" });
    const answerability = JSON.stringify(r.answerability ?? {});
    if (r.answerability?.status === "ambiguous") {
      check("C6", 'bare "Houston" -> asks which Houston (Phase 8), ZERO SQL, no invented state', spy.callCount === 0, `sqlCalls=${spy.callCount} ${answerability}`);
    } else {
      const real = await engine.execute({ question: "best hospital for heart pain Houston" });
      check("C6", 'bare "Houston" -> answered, every row HOUSTON (never Texas-wide)', real.success === true && rowsOf(real).length > 0 && rowsOf(real).every((x) => cityOf(x) === "HOUSTON"), `success=${real.success}`);
    }
  }
  {
    llmCalls = 0;
    const r = await engine.execute({ question: "tell me about Mayo Clinic" });
    check("C7", '"tell me about Mayo Clinic" -> 1 row, fast path: ZERO LLM calls and no llm-normalization gate', r.success === true && r.rowCount === 1 && llmCalls === 0 && !normalizationGate(r.trace as any), `success=${r.success} rowCount=${r.rowCount} llmCalls=${llmCalls}`);
  }
  {
    const r = await engine.execute({ question: "Compare Readmission Rates for Pneumonia in Florida vs Georgia" });
    const codes = [...new Set(rowsOf(r).map((x) => x["measure_code"]))];
    check("C8", "Bug D control: pneumonia FL vs GA -> 10 rows READM-30-PN-HRRP", r.success === true && r.rowCount === 10 && codes.length === 1 && codes[0] === "READM-30-PN-HRRP", `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "safest hosptials" });
    check("C9", '"safest hosptials" -> 10 nationwide rows (no "which state?" dead end)', r.success === true && r.rowCount === 10, `success=${r.success} rowCount=${r.rowCount} error=${r.error}`);
  }
  {
    const r1 = await engine.execute({ question: "Calfornia hospitals" });
    const r2 = await engine.execute({ question: "Texs hospitals" });
    check("C10", '"Calfornia hospitals" -> 100 CA rows; "Texs hospitals" -> 100 TX rows', r1.success === true && r1.rowCount === 100 && rowsOf(r1).every((x) => x["state"] === "CA") && r2.success === true && r2.rowCount === 100 && rowsOf(r2).every((x) => x["state"] === "TX"), `ca=${r1.rowCount} tx=${r2.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "Best hospitals in Texas" });
    check("C10b", '"Best hospitals in Texas" keeps its ranking: 10 rows, all TX (not an unranked 100-row list)', r.success === true && r.rowCount === 10 && rowsOf(r).every((x) => x["state"] === "TX"), `success=${r.success} rowCount=${r.rowCount}`);
  }
  console.log("    Phase 8.13 under the paid front door (spy executor, measured not assumed):");
  for (const [id, question, mustBeAmbiguous] of [
    ["C11", "compare memorial hospital vs Mayo Clinic", true],
    ["C12", "hospitals in ALBANY county", true],
    ["C13", "what's the weather in Dallas?", false],
    ["C14", "who is the chief of surgery at Johns Hopkins?", false],
    ["C15", "what's the weather in Texas?", false],
  ] as const) {
    const spy = { callCount: 0 };
    const r = await makeSpyEngine(spy).execute({ question });
    check(id, `"${question}" -> ${mustBeAmbiguous ? "ambiguous" : "refused"}, ZERO SQL`, r.success === false && spy.callCount === 0 && (!mustBeAmbiguous || r.answerability?.status === "ambiguous"), `success=${r.success} status=${r.answerability?.status} sqlCalls=${spy.callCount}`);
  }

  // -------------------------------------------------------------------------
  console.log("\n--- D. State-code variants (deterministic first, LLM only where designed) ---");
  {
    const codes: [string, string][] = [["tx", "Texas"], ["az", "Arizona"], ["ak", "Alaska"], ["ca", "California"], ["ny", "New York"]];
    for (const [code, name] of codes) {
      const variants = [code, code[0]!.toUpperCase() + code[1], code.toUpperCase(), code[0] + code[1]!.toUpperCase()];
      const outs = variants.map((v) => expandUppercaseStateAbbreviations(`Show me hospitals in ${v}`));
      check(`D-${code}`, `"in ${variants.join(" / ")}" all expand to ${name} with NO LLM`, outs.every((o) => o.includes(name)), JSON.stringify(outs));
    }
    check("D-OH", '"in OH" (uppercase) -> Ohio deterministically; lowercase/Title "oh"/"Oh" are the LLM\'s job',
      expandUppercaseStateAbbreviations("Show me hospitals in OH").includes("Ohio") &&
        expandUppercaseStateAbbreviations("Show me hospitals in oh") === "Show me hospitals in oh" &&
        expandUppercaseStateAbbreviations("Show me hospitals in Oh") === "Show me hospitals in Oh", "preprocessor behavior changed");
  }
  for (const [id, question, stateCode] of [
    ["D-e2e-oh", "show me hospitals in oh", "OH"],
    ["D-e2e-Oh", "show me hospitals in Oh", "OH"],
    ["D-e2e-OH", "show me hospitals in OH", "OH"],
    ["D-e2e-cali", "show me hospitals in cali", "CA"],
    ["D-e2e-tex", "show me hospitals in tex", "TX"],
    ["D-e2e-LA", "show me hospitals in LA", "LA"],
    ["D-e2e-Az", "show me hospitals in Az", "AZ"],
  ] as const) {
    const r = await engine.execute({ question });
    check(id, `"${question}" -> success, every row ${stateCode}`, r.success === true && rowsOf(r).length > 0 && rowsOf(r).every((x) => x["state"] === stateCode), `success=${r.success} rowCount=${r.rowCount} states=${JSON.stringify([...new Set(rowsOf(r).map((x) => x["state"]))].slice(0, 5))}`);
  }
  {
    const r = await engine.execute({ question: "show me hospitals in philly" });
    check("D-e2e-philly", '"hospitals in philly" -> Philadelphia only (no other city, no state-wide/nationwide widening), or a Phase 8 "which Philadelphia?" clarification',
      (r.success === true && rowsOf(r).length > 0 && rowsOf(r).every((x) => cityOf(x) === "PHILADELPHIA")) || r.answerability?.status === "ambiguous",
      `success=${r.success} rowCount=${r.rowCount} status=${r.answerability?.status} cities=${JSON.stringify([...new Set(rowsOf(r).map(cityOf))].slice(0, 4))}`);
    for (const q of ["show me hospitals in NYC", "show me hospitals in DFW", "show me hospitals in New York"]) {
      const x = await engine.execute({ question: q });
      const scopes = [...new Set(rowsOf(x).map((row) => row["state"]))];
      console.log(`    [info] "${q}" -> success=${x.success} rows=${rowsOf(x).length} states=${JSON.stringify(scopes)} ${x.success ? "" : `error=${String(x.error).slice(0, 80)}`}`);
    }
    console.log("    [info] New York / New Jersey / North Carolina return 0 rows from the DETERMINISTIC pipeline (pre-existing, confirmed on the deployed function; not an LLM issue).");
  }

  // -------------------------------------------------------------------------
  // Runs LAST: exercises failures on the shared per-tier circuit breakers.
  console.log("\n--- E. Stubbed-fetch proofs (no cost) ---");
  const realFetch = globalThis.fetch;
  type Call = { url: string; headers: Record<string, string>; body: any };
  type StubOut = { status: number; json: unknown } | { hang: true };
  const okCompletion = (content: string) => ({ choices: [{ message: { content } }] });
  const rewriteJson = JSON.stringify({ status: "ok", canonical_question: "Show me hospitals in Texas", reason: null });
  async function withStub(handler: (call: Call) => StubOut, run: (calls: Call[]) => Promise<void>) {
    const calls: Call[] = [];
    const previousFetch = globalThis.fetch; // stubs nest (resetPaidCircuits inside a test): restore the OUTER stub, not the real fetch
    globalThis.fetch = (async (url: any, init: any) => {
      const call: Call = { url: String(url), headers: init?.headers ?? {}, body: init?.body ? JSON.parse(init.body) : undefined };
      calls.push(call);
      const out = handler(call);
      if ("hang" in out) return new Promise<Response>(() => undefined);
      return new Response(JSON.stringify(out.json), { status: out.status, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    try {
      await run(calls);
    } finally {
      globalThis.fetch = previousFetch;
    }
  }
  const isAic = (c: Call) => c.url.includes("api.aicredits.in");
  const isFlash = (c: Call) => isAic(c) && c.body?.model === FLASH_MODEL;
  const isSecond = (c: Call) => isAic(c) && c.body?.model === SECOND_MODEL;
  const flashWithKey: typeof AICREDITS_QWEN_FLASH_TIER = { ...AICREDITS_QWEN_FLASH_TIER, apiKey: "test-key-not-real" };
  const secondWithKey: typeof AICREDITS_QWEN_30B_TIER = { ...AICREDITS_QWEN_30B_TIER, apiKey: "test-key-not-real" };
  const chainWithKeys = [flashWithKey, secondWithKey, ...FALLBACK_CHAIN];
  const ok = () => ({ status: 200, json: okCompletion(rewriteJson) });
  // A healthy call through each paid tier closes that tier's circuit again.
  async function resetPaidCircuits() {
    await withStub(ok, async () => {
      await new LLMModelGateway([], [flashWithKey]).normalizeMessyLanguage("hospitals in tx", DOMAIN_CAPABILITIES);
      await new LLMModelGateway([], [secondWithKey]).normalizeMessyLanguage("hospitals in tx", DOMAIN_CAPABILITIES);
    });
  }

  await withStub(ok, async (calls) => {
    const gw = new LLMModelGateway(FALLBACK_CHAIN, chainWithKeys);
    const r = await gw.normalizeMessyLanguage("hospitals in tx", DOMAIN_CAPABILITIES);
    const first = calls[0];
    check("E1", "request shape: POST https://api.aicredits.in/v1/chat/completions, Bearer key, model qwen3.7-flash, temperature 0, response_format json_object, reasoning DISABLED, system+user messages",
      calls.length === 1 && first?.url === "https://api.aicredits.in/v1/chat/completions" && first.headers["Authorization"] === "Bearer test-key-not-real" &&
        first.body.model === FLASH_MODEL && first.body.temperature === 0 && first.body.response_format?.type === "json_object" &&
        first.body.reasoning?.enabled === false && first.body.messages?.[0]?.role === "system" && first.body.messages?.[1]?.content === "hospitals in tx",
      JSON.stringify({ calls: calls.length, url: first?.url, model: first?.body?.model, reasoning: first?.body?.reasoning }));
    check("E2", "provenance from a healthy first-tier answer: aicredits / qwen3.7-flash / 1 attempt / no fallback", r.provenance?.provider === "aicredits" && r.provenance.keyId === FLASH_KEY_ID && r.provenance.attempts === 1 && r.provenance.fallbackUsed === false && r.provenance.tiers === FLASH_KEY_ID, JSON.stringify(r.provenance));
  });
  await withStub(() => ({ status: 200, json: okCompletion("ok") }), async (calls) => {
    const gw = new LLMModelGateway(FALLBACK_CHAIN, chainWithKeys);
    await gw.complete("system", "user");
    await gw.completeJSON("system", "user").catch(() => undefined);
    await gw.synthesizeSuggestions({ question: "q", candidates: ["a", "b", "c"] });
    await gw.selectAndRephraseSuggestions(["a", "b", "c", "d"], {}, 3);
    check("E3", `every non-rewrite role (complete, completeJSON, suggestions x2) -> ZERO requests to AICredits (${calls.length} calls, all free tier)`, calls.length > 0 && !calls.some(isAic), calls.map((c) => c.url).join(" | "));
  });
  await withStub((c) => (isAic(c) ? { status: 429, json: { error: { message: "rate limited" } } } : ok()), async (calls) => {
    await resetPaidCircuits();
    const gw = new LLMModelGateway(FALLBACK_CHAIN, chainWithKeys);
    calls.length = 0;
    const r = await gw.normalizeMessyLanguage("hospitals in tx", DOMAIN_CAPABILITIES);
    check("E4", "BOTH paid tiers rate-limited (429) -> exactly ONE request per tier (no retry, zero-stall), then the free chain answers; provenance says so",
      r.status === "ok" && calls.filter(isFlash).length === 1 && calls.filter(isSecond).length === 1 && r.provenance?.fallbackUsed === true &&
        r.provenance.provider !== "aicredits" && r.provenance.tiers.startsWith(`${FLASH_KEY_ID}>${SECOND_KEY_ID}>`) && r.provenance.attempts === 3,
      JSON.stringify(r.provenance));
    const freeBody = calls.find((c) => !isAic(c))?.body;
    check("E5", "field isolation: the free tier's body has no response_format and no reasoning; tier 2's body has JSON mode but no reasoning; only tier 1 carries reasoning:off",
      freeBody !== undefined && freeBody.response_format === undefined && freeBody.reasoning === undefined &&
        calls.find(isSecond)?.body.response_format?.type === "json_object" && calls.find(isSecond)?.body.reasoning === undefined &&
        calls.find(isFlash)?.body.reasoning?.enabled === false,
      JSON.stringify({ free: Object.keys(freeBody ?? {}), second: Object.keys(calls.find(isSecond)?.body ?? {}) }));
  });
  await withStub((c) => (isFlash(c) ? { status: 429, json: { error: { message: "upstream 429" } } } : ok()), async (calls) => {
    await resetPaidCircuits();
    const gw = new LLMModelGateway(FALLBACK_CHAIN, chainWithKeys);
    calls.length = 0;
    const r = await gw.normalizeMessyLanguage("hospitals in tx", DOMAIN_CAPABILITIES);
    check("E6", "flash rate-limited (429) -> the SECOND PAID tier answers (not the free chain): 1 flash request, 1 qwen3-30b request",
      r.status === "ok" && calls.filter(isFlash).length === 1 && calls.filter(isSecond).length === 1 && calls.every(isAic) &&
        r.provenance?.keyId === SECOND_KEY_ID && r.provenance.provider === "aicredits" && r.provenance.fallbackUsed === true && r.provenance.tiers === `${FLASH_KEY_ID}>${SECOND_KEY_ID}`,
      JSON.stringify(r.provenance));
  });
  await withStub((c) => (isAic(c) ? { status: 402, json: { error: { message: "insufficient credits", code: 402 } } } : ok()), async (calls) => {
    await resetPaidCircuits();
    const gw = new LLMModelGateway(FALLBACK_CHAIN, chainWithKeys);
    calls.length = 0;
    const r = await gw.normalizeMessyLanguage("hospitals in tx", DOMAIN_CAPABILITIES);
    check("E7", "paid credit exhausted (HTTP 402 on both tiers) -> ONE request per tier, no retry, then the free chain answers",
      r.status === "ok" && calls.filter(isAic).length === 2 && r.provenance?.provider !== "aicredits" && r.provenance?.fallbackUsed === true, JSON.stringify(r.provenance));
  });
  await withStub(ok, async (calls) => {
    const gw = new LLMModelGateway(FALLBACK_CHAIN, [{ ...AICREDITS_QWEN_FLASH_TIER, apiKey: undefined }, { ...AICREDITS_QWEN_30B_TIER, apiKey: undefined }, ...FALLBACK_CHAIN]);
    const r = await gw.normalizeMessyLanguage("hospitals in tx", DOMAIN_CAPABILITIES);
    check("E8", "ZAI_API_KEY unset -> both paid tiers skipped with ZERO requests (Graceful Unset Bypass); rewrite works on the free chain exactly as before", r.status === "ok" && !calls.some(isAic) && r.provenance?.provider !== "aicredits", JSON.stringify(r.provenance));
  });
  await withStub((c) => (isAic(c) ? { status: 500, json: { error: "down" } } : ok()), async (calls) => {
    await resetPaidCircuits();
    const gw = new LLMModelGateway([], [flashWithKey, secondWithKey]);
    calls.length = 0;
    const r = await gw.normalizeMessyLanguage("hospitals in tx", DOMAIN_CAPABILITIES);
    check("E9", "every tier down -> honest 'LLM gateway unavailable' WITH provenance (2 attempts, no retries, both tiers recorded)", r.status === "fallback" && r.reason === "LLM gateway unavailable" && r.provenance?.provider === "none" && r.provenance.attempts === 2 && r.provenance.tiers === `${FLASH_KEY_ID}>${SECOND_KEY_ID}` && calls.length === 2, JSON.stringify(r));
  });
  await withStub((c) => (isFlash(c) ? { hang: true } : ok()), async (calls) => {
    await resetPaidCircuits();
    const gw = new LLMModelGateway(FALLBACK_CHAIN, chainWithKeys);
    calls.length = 0;
    const t0 = Date.now();
    const r = await gw.normalizeMessyLanguage("hospitals in tx", DOMAIN_CAPABILITIES);
    const elapsed = Date.now() - t0;
    check("E10", `flash hangs -> cut off at 3 s (no retry) and qwen3-30b answers: elapsed ${elapsed} ms, exactly 1 flash request`,
      r.status === "ok" && elapsed >= 2900 && elapsed < 4500 && calls.filter(isFlash).length === 1 && r.provenance?.keyId === SECOND_KEY_ID,
      `elapsed=${elapsed} ${JSON.stringify(r.provenance)}`);
  });
  await withStub((c) => (isFlash(c) ? { status: 429, json: { error: { message: "upstream 429" } } } : ok()), async (calls) => {
    await resetPaidCircuits();
    const gw = new LLMModelGateway(FALLBACK_CHAIN, chainWithKeys);
    for (let i = 0; i < 3; i++) await gw.normalizeMessyLanguage("hospitals in tx", DOMAIN_CAPABILITIES);
    calls.length = 0;
    const r = await gw.normalizeMessyLanguage("hospitals in tx", DOMAIN_CAPABILITIES);
    check("E11", "per-tier circuit breakers: after 3 flash failures flash is skipped (ZERO flash requests) while qwen3-30b - a different circuit - keeps answering",
      r.status === "ok" && calls.filter(isFlash).length === 0 && calls.filter(isSecond).length === 1 && r.provenance?.keyId === SECOND_KEY_ID && r.provenance.tiers === SECOND_KEY_ID,
      `flash=${calls.filter(isFlash).length} second=${calls.filter(isSecond).length} ${JSON.stringify(r.provenance)}`);
  });

  console.log("\n" + "=".repeat(100));
  console.log(`RESULT: ${pass} passed, ${fail} failed (${pass + fail} total)`);
  console.log("=".repeat(100));
  if (fail > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
