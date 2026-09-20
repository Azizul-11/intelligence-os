#!/usr/bin/env -S pnpm exec tsx
/**
 * 600-query baseline dogfooding sweep (DogfoodingV1 catalog, rows A001..J020).
 *
 * Runs every row ONCE, in catalog order, against the DEPLOYED orchestrator over HTTPS - the same wire
 * contract the frontend uses (POST {question, domain, pendingInteractionId?, continuationResponse?}).
 * That is the live production path: Layer 0 regex, Layer 0.5 LLM front door, the full Phase 8 gate stack,
 * the real warehouse. No engine code is imported, nothing is edited, nothing is deployed.
 *
 * Multi-turn: a row with `precededBy` is sent as a Layer 2 continuation of its Turn 1 (same
 * pendingInteractionId, question === continuationResponse, exactly as QueryConsole does). If Turn 1 did not
 * open a session the Turn 2 text runs standalone and is flagged `turn2.context = "no-session"`.
 *
 * This script only OBSERVES and records; expected-vs-actual scoring and the report are built offline from
 * the raw file, so scoring rules can be changed without another live run.
 *
 * Usage (repo root):
 *   pnpm exec tsx scripts/run-600-dogfooding-sweep.ts [--fresh] [--ids A001,A002] [--limit N] [--out FILE]
 * Resumes automatically from the output file unless --fresh is given.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { env } from "./shared/env";

const CATALOG = "docs/LLM-FIRST-FRONT/DogfoodingV1/500_DOGFOODING_QUERY_CATALOG.json";
const DEFAULT_OUT = "docs/LLM-FIRST-FRONT/DogfoodingV1Report/DOGFOODING_600_RAW.jsonl";
const ORCHESTRATOR_URL = `${env.supabaseUrl.replace(/\/$/, "")}/functions/v1/orchestrator`;
const REQUEST_TIMEOUT_MS = 120_000;
const PAUSE_MS = 150;

type Behavior = "PASS" | "CLARIFY" | "REFUSE";

interface CatalogRow {
  id: string;
  category: string;
  query: string;
  expectedIntent: string;
  expectedCapability: string;
  expectedBehavior: Behavior;
  sourceDoc: string;
  sourceKind: string;
  group: string;
  riskClass?: string;
  precededBy?: string;
  auditProbeNo?: number;
  alsoAcceptable?: Behavior[];
}

interface TraceEntry { phase: string; status: string; sqlCalls: number; answerability?: string; detail?: Record<string, string | number | boolean> }
interface LlmCall { role: string; provider: string; model: string; keyId: string; attempts: number; latencyMs: number; tiers: string; fallbackUsed: boolean }
interface Wire {
  success: boolean;
  answer: string;
  error?: string;
  metadata?: { executionTimeMs?: number; rowCount?: number };
  pendingInteractionId?: string;
  interactionKind?: "clarification" | "guidance";
  requestId?: string;
  answerability?: { status: string; reason?: string; candidates?: { value: string; label: string }[]; alternatives?: { capabilityId: string }[] };
  trace?: TraceEntry[];
  suggestions?: string[];
  summary?: string;
  llmCalls?: LlmCall[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

// ------------------------------------------------------------------------------------------------ transport
async function call(question: string, pendingInteractionId?: string) {
  const payload: Record<string, unknown> = { question, domain: "healthcare" };
  if (pendingInteractionId) {
    payload.pendingInteractionId = pendingInteractionId;
    payload.continuationResponse = question;
  }
  let lastError = "";
  let clientMs = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(ORCHESTRATOR_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: env.supabaseAnonKey, Authorization: `Bearer ${env.supabaseAnonKey}` },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const text = await res.text();
      clientMs = Math.round(performance.now() - started);
      let body: Wire | undefined;
      try { body = JSON.parse(text) as Wire; } catch { /* non-JSON */ }
      if (body && (res.status < 500 || body.trace)) return { attempts: attempt, httpStatus: res.status, clientMs, body };
      lastError = `HTTP ${res.status}: ${(body?.error ?? text).slice(0, 240)}`;
      if (body && attempt === 2) return { attempts: attempt, httpStatus: res.status, clientMs, body, transportError: lastError };
    } catch (e) {
      clientMs = Math.round(performance.now() - started);
      lastError = e instanceof Error ? e.message : String(e);
    } finally {
      clearTimeout(timer);
    }
    if (attempt < 2) await sleep(1500);
  }
  return { attempts: 2, httpStatus: 0, clientMs, transportError: lastError, body: undefined as Wire | undefined };
}

// ------------------------------------------------------------------------------------------------ observation helpers
const ASKS_USER = /(\?|please (include|specify|provide|tell|clarify)|more (specific|identifying)|which (state|hospital|city|county)|need (a|the) (state|city|county))/i;
const LEAK = /(eyJ[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}|BEGIN (RSA|PRIVATE)|service[_ ]role|SUPABASE_|RULE [1-5] -|you are an? (assistant|normalizer|classifier))/i;

function parseRows(body: Wire): Record<string, unknown>[] | undefined {
  if (!body.success || typeof body.answer !== "string" || !body.answer.trimStart().startsWith("[")) return undefined;
  try { return JSON.parse(body.answer) as Record<string, unknown>[]; } catch { return undefined; }
}

function tally(rows: Record<string, unknown>[], col: string, top = 8): Record<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = r[col];
    if (v === undefined || v === null || v === "") continue;
    counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, top));
}

const METRIC_COLS = ["score", "excess_readmission_ratio", "safety_score", "avg_patient_satisfaction", "hospital_count", "overall_rating", "mort_measures_better", "readm_measures_better"];

function observe(rows: Record<string, unknown>[]) {
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  const metricCol = METRIC_COLS.find((c) => columns.includes(c));
  return {
    columns,
    n: rows.length,
    states: tally(rows, "state"),
    counties: tally(rows, "county"),
    cities: tally(rows, "city"),
    ownerships: tally(rows, "ownership", 6),
    hospitalTypes: tally(rows, "hospital_type", 5),
    measureCodes: tally(rows, "measure_code", 4),
    ratings: tally(rows, "overall_rating", 6),
    metricCol: metricCol ?? null,
    metricSeries: metricCol ? rows.slice(0, 14).map((r) => r[metricCol]) : [],
    names: rows.slice(0, 12).map((r) => `${r.hospital_name ?? ""} | ${r.city ?? ""} | ${r.state ?? ""}`),
    head: rows.slice(0, 3).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 80) : v]))),
  };
}

function guessCapability(o: ReturnType<typeof observe>): string {
  const c = new Set(o.columns);
  const measure = Object.keys(o.measureCodes)[0];
  if (c.has("hospital_count")) return "hospital-count-by-state";
  if (c.has("measure_code") && c.has("score")) return `mortality-condition-ranking${measure ? ":" + measure : ""}`;
  if (c.has("measure_code") && c.has("excess_readmission_ratio")) return `readmission-condition-ranking${measure ? ":" + measure : ""}`;
  if (c.has("safety_score")) return "safety-performance-ranking";
  if (c.has("emergency_services") && c.has("mort_measures_worse") && c.has("avg_patient_satisfaction")) return o.n <= 3 ? "hospital-detail (dossier / comparison)" : "hospital-detail (multi-row)";
  if (c.has("avg_patient_satisfaction")) return "patient-experience-ranking";
  if (c.has("mort_measures_better") && !c.has("measure_code")) return "mortality-rate-ranking (generic)";
  if (c.has("readm_measures_better") && !c.has("measure_code")) return "readmission-rate-ranking (generic)";
  if (o.columns.join() === "state,facility_id,hospital_name,overall_rating") return "hospital-overall-rating-ranking-by-state";
  if (o.columns.join() === "state,county,facility_id,hospital_name,overall_rating") return "hospital-overall-rating-ranking-by-county";
  if (c.has("hospital_type") && c.has("emergency_services") && c.has("ownership")) return "hospital-list-by-state";
  if (c.has("overall_rating") && c.has("hospital_name")) return "hospital-overall-rating-ranking";
  return "unknown";
}

function summarize(row: CatalogRow, res: Awaited<ReturnType<typeof call>>, turn2: Record<string, unknown> | null, isContinuation: boolean) {
  const body = res.body;
  const base = {
    id: row.id, category: row.category, group: row.group, query: row.query, expectedBehavior: row.expectedBehavior, alsoAcceptable: row.alsoAcceptable ?? [],
    riskClass: row.riskClass ?? "", expectedIntent: row.expectedIntent, expectedCapability: row.expectedCapability, precededBy: row.precededBy ?? null,
    request: { question: row.query, continuation: isContinuation },
    turn2, http: { status: res.httpStatus, attempts: res.attempts, clientMs: res.clientMs },
  };
  if (!body || res.httpStatus >= 500) {
    return { ...base, actualStatus: "error", actualBehavior: "ERROR", success: false, rowCount: 0, error: res.transportError ?? body?.error ?? "no response", path: "none", sqlReached: false, sqlCount: 0, llmCalls: body?.llmCalls ?? [] };
  }
  const trace = body.trace ?? [];
  const phases = trace.filter((t) => t.status === "enter").map((t) => t.phase);
  const norm = trace.find((t) => t.phase === "llm-normalization" && t.status !== "enter");
  const llmCalls = body.llmCalls ?? [];
  const normCalls = llmCalls.filter((c) => c.role === "normalizer");
  const rows = parseRows(body);
  const conversational = body.answerability?.status === "conversational";
  const sqlReached = phases.includes("deterministic-warehouse-execution") || (body.success && !conversational && (rows?.length ?? 0) > 0);
  const err = body.error ?? "";

  let actualBehavior: string;
  let actualStatus: string;
  if (conversational) { actualBehavior = "PASS"; actualStatus = "conversational"; }
  else if (body.success) { actualBehavior = "PASS"; actualStatus = "success"; }
  else if (body.interactionKind === "clarification" || body.answerability?.status === "ambiguous" || norm?.status === "clarification") { actualBehavior = "CLARIFY"; actualStatus = "needsClarification"; }
  else if (body.interactionKind === "guidance") { actualBehavior = "REFUSE"; actualStatus = "refusal"; }
  else if (ASKS_USER.test(err) && !/I specialize in US hospital/.test(err)) { actualBehavior = "CLARIFY"; actualStatus = "needsClarification"; }
  else if (body.answerability?.status === "not_directly_answerable" || err) { actualBehavior = "REFUSE"; actualStatus = "refusal"; }
  else { actualBehavior = "ERROR"; actualStatus = "error"; }

  const path = isContinuation ? "layer2-continuation"
    : conversational ? "layer0-conversational"
    : phases.includes("llm-normalization") ? "layer0.5-llm"
    : normCalls.length > 0 ? "layer1-on-failure"
    : "deterministic-bypass";
  const tier = normCalls[0];
  const observed = rows ? observe(rows) : undefined;
  const text = [body.answer, err, body.summary, ...(body.suggestions ?? [])].join(" ");
  const cands = body.answerability?.candidates ?? [];

  return {
    ...base,
    actualStatus, actualBehavior, success: body.success, rowCount: body.metadata?.rowCount ?? rows?.length ?? 0, serverMs: body.metadata?.executionTimeMs ?? null,
    answerability: body.answerability ? { status: body.answerability.status, reason: body.answerability.reason ?? null } : null,
    candidates: cands.length ? { count: cands.length, labels: cands.slice(0, 40).map((c) => c.label) } : null,
    alternatives: (body.answerability?.alternatives ?? []).map((a) => a.capabilityId),
    pendingInteractionId: body.pendingInteractionId ?? null, interactionKind: body.interactionKind ?? null,
    path,
    llmNormalization: norm ? { status: norm.status, detail: norm.detail ?? null } : null,
    normalizerTier: tier ? `${tier.provider}/${tier.model}` : null,
    tierClass: tier ? (tier.provider === "aicredits" ? "paid" : tier.provider === "none" ? "none" : "free") : null,
    fallbackUsed: tier?.fallbackUsed ?? null,
    llmCalls,
    phases,
    sqlReached, sqlCount: sqlReached ? 1 : 0, traceSqlSum: trace.reduce((s, t) => s + (t.sqlCalls ?? 0), 0),
    error: err || null,
    answerText: rows ? null : (body.answer ?? "").slice(0, 500),
    summary: body.summary ? body.summary.slice(0, 320) : null,
    suggestions: body.suggestions ?? [],
    observed: observed ?? null,
    actualCapability: observed ? guessCapability(observed) : (conversational ? "layer0:conversational" : null),
    leakFlag: LEAK.test(text) ? (text.match(LEAK)?.[0] ?? "") : null,
    requestId: body.requestId ?? null,
  };
}

// ------------------------------------------------------------------------------------------------ deterministic replay (baseline for Layer 0.5 recovery / break rates)
/**
 * `--mode replay`: for every row whose LIVE answer went through an LLM normalizer call, run the SAME question
 * through the SAME engine wiring production uses (domain-registry.ts) but with NO `llmFallback` hook - the pure
 * deterministic pipeline against the real warehouse - so each LLM-path row has a deterministic-only outcome to
 * compare with. `--rewrites` additionally re-calls the gateway normalizer once per Layer 0.5 row to record the
 * canonical rewrite text (the live response only carries which tier answered, not what it rewrote to; a
 * re-call can differ from the live one and is labelled as a replay).
 */
async function replay() {
  const catalog = JSON.parse(readFileSync(resolve(CATALOG), "utf-8")) as CatalogRow[];
  const byId = new Map(catalog.map((r) => [r.id, r]));
  const inPath = resolve(opt("--in") ?? DEFAULT_OUT);
  const fidelity = opt("--fidelity") ? Number(opt("--fidelity")) : 0; // sample N deterministic-bypass rows to prove the local engine reproduces the deployed one
  const outPath = resolve(opt("--out") ?? DEFAULT_OUT.replace("_RAW", fidelity ? "_FIDELITY" : "_DET_REPLAY"));
  const live = readFileSync(inPath, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, any>).filter((r) => r.type !== "preflight");
  const bypass = live.filter((r) => r.path === "deterministic-bypass" && r.actualStatus !== "conversational");
  const stride = fidelity ? Math.max(1, Math.floor(bypass.length / fidelity)) : 1;
  const targets = fidelity
    ? bypass.filter((_r, i) => i % stride === 0).slice(0, fidelity)
    : live.filter((r) => Array.isArray(r.llmCalls) && r.llmCalls.some((c: LlmCall) => c.role === "normalizer") && !r.request?.continuation);
  delete process.env.LLM_FIRST_FRONT_DOOR_ENABLED;

  const { healthcareDomain, DOMAIN_CAPABILITIES } = await import("../domain-packs/healthcare/src/index");
  const { expandUppercaseStateAbbreviations } = await import("../domain-packs/healthcare/src/runtime/state-abbreviation-preprocessor");
  const { createDomainRuntime } = await import("../packages/domain-runtime/src/index");
  const { createSemanticResolver } = await import("../packages/semantic/src/index");
  const { createRuntimeEngine } = await import("../packages/runtime-engine/src/create-runtime-engine");
  const { QueryPlanner } = await import("../packages/query-planner/src/query-planner");
  const { ExecutionPlanMapper } = await import("../packages/query-planner/src/execution-plan-mapper");
  const { SqlExecutor } = await import("../packages/sql-executor/src/sql-executor");
  const { SupabaseDatabaseAdapter } = await import("../packages/sql-executor/src/supabase-database-adapter");
  const { createClient } = await import("@supabase/supabase-js");
  const { llmGateway } = await import("../packages/llm-model-gateway/src/llm-model-gateway");

  const runtime = createDomainRuntime(healthcareDomain);
  const engine = createRuntimeEngine({
    runtime,
    semantic: createSemanticResolver(runtime.registry, runtime.entityProvider),
    planner: new QueryPlanner(),
    executionPlanMapper: new ExecutionPlanMapper(),
    executor: new SqlExecutor(new SupabaseDatabaseAdapter(createClient(env.supabaseUrl, env.supabaseServiceRoleKey))),
    preprocessQuestion: expandUppercaseStateAbbreviations,
    // no llmFallback: deterministic only
  });

  const replayed = new Set<string>();
  if (existsSync(outPath) && !flag("--fresh")) {
    for (const l of readFileSync(outPath, "utf-8").split("\n").filter(Boolean)) replayed.add((JSON.parse(l) as { id: string }).id);
  } else {
    writeFileSync(outPath, "");
  }
  console.error(`replay: ${targets.length} LLM-path rows (of ${live.length}); ${replayed.size} already replayed -> ${outPath}`);
  for (const rec of targets) {
    if (replayed.has(rec.id as string)) continue;
    const row = byId.get(rec.id as string)!;
    const started = performance.now();
    let det: Record<string, unknown>;
    try {
      const r = await engine.execute({ question: row.query });
      const wire: Wire = {
        success: r.success, answer: r.success ? JSON.stringify(r.rows ?? []) : "", error: r.error,
        answerability: r.answerability as Wire["answerability"], trace: r.trace as unknown as TraceEntry[], metadata: { rowCount: r.rowCount }, llmCalls: [],
      };
      det = summarize(row, { attempts: 1, httpStatus: 200, clientMs: Math.round(performance.now() - started), body: wire }, null, false);
    } catch (e) {
      det = { actualBehavior: "ERROR", error: e instanceof Error ? e.message : String(e) };
    }
    let rewrite: Record<string, unknown> | null = null;
    if (flag("--rewrites") && (rec.path === "layer0.5-llm" || rec.path === "layer1-on-failure")) {
      try {
        const g = await llmGateway.normalizeMessyLanguage(row.query, DOMAIN_CAPABILITIES);
        rewrite = { status: g.status, canonical_question: g.canonical_question ?? null, reason: g.reason ?? null, provenance: g.provenance ?? null };
      } catch (e) {
        rewrite = { status: "error", error: e instanceof Error ? e.message : String(e) };
      }
    }
    appendFileSync(outPath, JSON.stringify({ id: row.id, query: row.query, det, rewrite }) + "\n");
    console.error(`${row.id} live=${rec.actualBehavior} det=${(det as any).actualBehavior} rows=${(det as any).rowCount ?? "-"}  ${row.query.slice(0, 60)}`);
  }
  console.error("replay done");
}

// ------------------------------------------------------------------------------------------------ local-live (pre-deploy gate)
/**
 * `--mode local`: the working-tree engine wired exactly like `domain-registry.ts` (Layer 0.5 enabled, the paid
 * normalizer first, the healthcare capability catalog) against the LIVE warehouse - what would be deployed, without
 * deploying it. Covers Layer 0.5, the Phase 8 gates and SQL. It cannot cover Layer 0 (`chat.ts`) or Layer 2
 * continuations, so Turn 2 rows and the four conversational rows are skipped (Layer 0 is unit-tested; the deployed
 * re-run covers the rest). `--paths a,b` keeps only rows whose DEPLOYED-baseline path is listed; `--ids` selects rows.
 * Output: one JSONL record per row in the same shape as the deployed sweep, so the same scorer reads it.
 */
// Mirrors chat.ts `softenBluntFailureMessage`: the deployed handler replaces these raw engine errors with the guidance
// redirect, so a local run must classify them the same way (otherwise "...identify exactly which record..." reads as a question).
const BLUNT_ENGINE_ERRORS = new Set([
  "Unable to resolve question.",
  "SQL template not found.",
  "I don't have enough specific information to identify exactly which record this question refers to. Please include more identifying detail (such as a full name or location) and try again.",
  "Unable to create query plan.",
]);
const BLUNT_REDIRECT = "I specialize in US hospital clinical performance and healthcare analytics - I couldn't quite match that to something I track. Here are a few things I can help with:";

async function localSweep() {
  // `--no-llm`: deterministic-only run (Layer 0.5 and the on-failure Layer 1 both off) - free of LLM cost, for what-if checks.
  const noLlm = flag("--no-llm");
  process.env.LLM_FIRST_FRONT_DOOR_ENABLED = noLlm ? "false" : "true";
  const catalog = JSON.parse(readFileSync(resolve(CATALOG), "utf-8")) as CatalogRow[];
  const outPath = resolve(opt("--out") ?? DEFAULT_OUT.replace("_RAW", "_LOCAL"));
  const baseline = new Map(
    readFileSync(resolve(DEFAULT_OUT), "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, any>).filter((r) => r.type !== "preflight").map((r) => [r.id as string, r]),
  );
  const only = opt("--ids")?.split(",");
  const paths = opt("--paths")?.split(",");
  const concurrency = Number(opt("--concurrency") ?? 3);
  // `--adhoc file.json`: [{ id, query, expectedBehavior? }] instead of the catalog (frontend test matrix queries).
  const adhoc = opt("--adhoc")
    ? (JSON.parse(readFileSync(resolve(opt("--adhoc")!), "utf-8")) as { id: string; query: string; expectedBehavior?: Behavior }[]).map(
        (a) => ({ category: "adhoc", expectedIntent: "", expectedCapability: "", sourceDoc: "", sourceKind: "adhoc", group: "adhoc", expectedBehavior: "PASS" as Behavior, ...a }) as CatalogRow,
      )
    : undefined;
  const targets = (adhoc ?? catalog).filter((r) => {
    if (adhoc) return true;
    if (r.precededBy) return false;                                            // Turn 2 replies need a live session
    if (only && !only.includes(r.id)) return false;
    const path = baseline.get(r.id)?.path;
    if (path === "layer2-continuation") return false;
    if (path === "layer0-conversational" && r.id !== "C048") return false;   // C048 is analytical after Batch 1.1
    if (paths && !paths.includes(path)) return false;
    return true;
  });

  const { healthcareDomain, DOMAIN_CAPABILITIES } = await import("../domain-packs/healthcare/src/index");
  const { expandUppercaseStateAbbreviations } = await import("../domain-packs/healthcare/src/runtime/state-abbreviation-preprocessor");
  const { createDomainRuntime } = await import("../packages/domain-runtime/src/index");
  const { createSemanticResolver } = await import("../packages/semantic/src/index");
  const { createRuntimeEngine } = await import("../packages/runtime-engine/src/create-runtime-engine");
  const { QueryPlanner } = await import("../packages/query-planner/src/query-planner");
  const { ExecutionPlanMapper } = await import("../packages/query-planner/src/execution-plan-mapper");
  const { SqlExecutor } = await import("../packages/sql-executor/src/sql-executor");
  const { SupabaseDatabaseAdapter } = await import("../packages/sql-executor/src/supabase-database-adapter");
  const { createClient } = await import("@supabase/supabase-js");
  const { llmGateway, withLlmCallLog } = await import("../packages/llm-model-gateway/src/llm-model-gateway");
  const { mapNormalizerResult, normalizeQuestion } = await import("../supabase/functions/orchestrator/services/normalizer-hook").catch(() => ({ mapNormalizerResult: undefined as undefined | ((r: any) => unknown), normalizeQuestion: undefined as undefined | ((q: string, c: unknown, n: (q: string) => Promise<unknown>) => Promise<unknown>) }));

  const { preflightClarification } = await import("../supabase/functions/orchestrator/services/conversational");
  const runtime = createDomainRuntime(healthcareDomain);
  const engine = createRuntimeEngine({
    runtime,
    semantic: createSemanticResolver(runtime.registry, runtime.entityProvider),
    planner: new QueryPlanner(),
    executionPlanMapper: new ExecutionPlanMapper(),
    executor: new SqlExecutor(new SupabaseDatabaseAdapter(createClient(env.supabaseUrl, env.supabaseServiceRoleKey))),
    preprocessQuestion: expandUppercaseStateAbbreviations,
    // Same mapping as supabase/functions/orchestrator/services/domain-registry.ts (shared module once Batch 1.3 lands).
    llmFallback: noLlm ? undefined : async (question: string) => {
      // Batch 3: the same pre-check + mapping the deployed function runs (services/normalizer-hook.ts normalizeQuestion).
      if (normalizeQuestion) return (normalizeQuestion as any)(question, DOMAIN_CAPABILITIES, (text: string) => llmGateway.normalizeMessyLanguage(text, DOMAIN_CAPABILITIES));
      const result = await llmGateway.normalizeMessyLanguage(question, DOMAIN_CAPABILITIES);
      if (mapNormalizerResult) return (mapNormalizerResult as any)(result, DOMAIN_CAPABILITIES);
      const meta = result.provenance ? { meta: { ...result.provenance } } : {};
      if (result.status === "ok" && result.canonical_question) return { canonicalQuestion: result.canonical_question, ...meta };
      if (result.status === "need_clarification" && result.reason) return { clarification: result.reason, ...meta };
      return result.provenance ? { meta: { ...result.provenance } } : null;
    },
  });

  // Batch 4: chat.ts asks about a follow-up / "top 0" before the pipeline (services/conversational.ts); mirrored here.
  const execute = async (question: string) => {
    const ask = preflightClarification(question);
    return ask
      ? { result: { success: false, rows: [], rowCount: 0, error: ask, answerability: { status: "not_directly_answerable" }, trace: [] } as any, calls: [] as any[] }
      : withLlmCallLog(() => engine.execute({ question }));
  };

  const done = new Set<string>();
  if (existsSync(outPath) && !flag("--fresh")) {
    for (const l of readFileSync(outPath, "utf-8").split("\n").filter(Boolean)) done.add((JSON.parse(l) as { id: string }).id);
  } else {
    writeFileSync(outPath, "");
  }
  const queue = targets.filter((r) => !done.has(r.id));
  console.error(`local-live: ${targets.length} rows (${done.size} already done) concurrency ${concurrency} -> ${outPath}`);
  const realLog = console.log;
  console.log = () => {};                                                        // the engine prints every gate; keep the progress lines only

  const results = new Map<string, Record<string, any>>();
  const work = async () => {
    for (let row = queue.shift(); row; row = queue.shift()) {
      const started = performance.now();
      let rec: Record<string, unknown>;
      try {
        const { result: r, calls } = await execute(row!.query);
        const wire: Wire = {
          success: r.success, answer: r.success ? JSON.stringify(r.rows ?? []) : "", error: r.error && BLUNT_ENGINE_ERRORS.has(r.error) ? BLUNT_REDIRECT : r.error,
          answerability: r.answerability as Wire["answerability"], trace: r.trace as unknown as TraceEntry[], metadata: { rowCount: r.rowCount },
          llmCalls: calls as unknown as LlmCall[],
        };
        rec = summarize(row!, { attempts: 1, httpStatus: 200, clientMs: Math.round(performance.now() - started), body: wire }, null, false);
      } catch (e) {
        rec = { id: row!.id, query: row!.query, actualBehavior: "ERROR", error: e instanceof Error ? e.message : String(e) };
      }
      results.set(row!.id, rec as Record<string, any>);
      appendFileSync(outPath, JSON.stringify(rec) + "\n");
      const base = baseline.get(row!.id);
      console.error(`${row!.id} exp=${row!.expectedBehavior.padEnd(7)} local=${String((rec as any).actualBehavior).padEnd(7)} deployed=${String(base?.actualBehavior).padEnd(7)} rows=${String((rec as any).rowCount ?? "-").padStart(3)}  ${row!.query.slice(0, 58)}`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, work));

  // A row whose normalizer got no answer from ANY tier (rate limits / an open circuit breaker) says nothing about the
  // code: re-run those, one at a time after a pause, up to 3 more passes, and keep the latest record per row.
  const noAnswer = (rec?: Record<string, any>) => (rec?.llmCalls ?? []).some((c: LlmCall) => c.role === "normalizer" && c.provider === "none");
  for (let pass = 1; pass <= 3; pass++) {
    const again = targets.filter((r) => noAnswer(results.get(r.id)));
    if (again.length === 0) break;
    console.error(`retry pass ${pass}: ${again.length} rows had no normalizer answer; pausing 45 s`);
    await sleep(45_000);
    for (const row of again) {
      const started = performance.now();
      try {
        const { result: r, calls } = await execute(row.query);
        const wire: Wire = {
          success: r.success, answer: r.success ? JSON.stringify(r.rows ?? []) : "", error: r.error && BLUNT_ENGINE_ERRORS.has(r.error) ? BLUNT_REDIRECT : r.error,
          answerability: r.answerability as Wire["answerability"], trace: r.trace as unknown as TraceEntry[], metadata: { rowCount: r.rowCount },
          llmCalls: calls as unknown as LlmCall[],
        };
        const rec = summarize(row, { attempts: 1, httpStatus: 200, clientMs: Math.round(performance.now() - started), body: wire }, null, false) as Record<string, any>;
        rec.retryPass = pass;
        results.set(row.id, rec);
        appendFileSync(outPath, JSON.stringify(rec) + "\n");                    // later lines supersede earlier ones for the same id
        console.error(`retry ${row.id} local=${rec.actualBehavior} normalizer=${noAnswer(rec) ? "none" : "answered"}`);
      } catch (e) {
        console.error(`retry ${row.id} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      await sleep(600);
    }
  }
  console.log = realLog;
  console.error("local-live done");
}

// ------------------------------------------------------------------------------------------------ main
async function main() {
  if (opt("--mode") === "local") return localSweep();
  if (opt("--mode") === "replay") return replay();
  const catalog = JSON.parse(readFileSync(resolve(CATALOG), "utf-8")) as CatalogRow[];
  const outPath = resolve(opt("--out") ?? DEFAULT_OUT);
  mkdirSync(dirname(outPath), { recursive: true });

  // ---- catalog integrity
  const exact = new Set(catalog.map((r) => r.query));
  const lower = new Map<string, string[]>();
  for (const r of catalog) lower.set(r.query.toLowerCase().replace(/[?.!,;:]+$/, ""), [...(lower.get(r.query.toLowerCase().replace(/[?.!,;:]+$/, "")) ?? []), r.query]);
  const caseGroups = [...lower.values()].filter((v) => v.length > 1);
  console.error(`catalog: ${catalog.length} rows, ${new Set(catalog.map((r) => r.id)).size} unique ids, ${exact.size} unique exact strings, ${caseGroups.length} case-variant groups, ` +
    `${catalog.filter((r) => r.precededBy).length} Turn-2 rows, ${catalog.filter((r) => r.alsoAcceptable).length} alsoAcceptable rows`);
  if (catalog.length !== 600 || exact.size !== 600) throw new Error("catalog is not the expected 600 unique rows");

  // ---- resume
  const done = new Map<string, Record<string, unknown>>();
  if (existsSync(outPath) && !flag("--fresh")) {
    for (const line of readFileSync(outPath, "utf-8").split("\n")) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line) as Record<string, unknown>;
      if (typeof rec.id === "string" && rec.type !== "preflight") done.set(rec.id, rec);
    }
  } else {
    writeFileSync(outPath, "");
  }

  // ---- preflight: the paid tier must answer first, and Layer 0.5 must be active
  if (!existsSync(outPath) || readFileSync(outPath, "utf-8").indexOf('"type":"preflight"') < 0) {
    await call("how many hospitals are in Florida"); // warm the function; result discarded
    const pf = await call("hospitals in oh");
    const first = pf.body?.llmCalls?.find((c) => c.role === "normalizer");
    const ok = pf.body?.trace?.some((t) => t.phase === "llm-normalization") === true && first?.provider === "aicredits" && first?.model === "qwen/qwen3.7-flash";
    const record = { type: "preflight", at: new Date().toISOString(), url: ORCHESTRATOR_URL, layer05Active: pf.body?.trace?.some((t) => t.phase === "llm-normalization") === true,
      firstNormalizerTier: first ? `${first.provider}/${first.model}` : null, paidFirst: ok, clientMs: pf.clientMs };
    appendFileSync(outPath, JSON.stringify(record) + "\n");
    console.error("preflight:", JSON.stringify(record));
    if (!ok) throw new Error("preflight failed: Layer 0.5 not active or the paid qwen/qwen3.7-flash tier did not answer first - stopping before the sweep");
  }

  const only = opt("--ids")?.split(",");
  const limit = opt("--limit") ? Number(opt("--limit")) : Infinity;
  let ran = 0;
  let consecutiveErrors = 0;
  const startedAt = Date.now();

  for (const row of catalog) {
    if (only && !only.includes(row.id)) continue;
    if (done.has(row.id)) continue;
    if (ran >= limit) break;

    let pending: string | undefined;
    let turn2: Record<string, unknown> | null = null;
    let isContinuation = false;
    if (row.precededBy) {
      const t1 = done.get(row.precededBy);
      pending = (t1?.pendingInteractionId as string | null) ?? undefined;
      isContinuation = Boolean(pending);
      turn2 = { turn1Id: row.precededBy, turn1Behavior: t1?.actualBehavior ?? null, turn1OpenedSession: Boolean(pending), context: pending ? "session" : "no-session" };
    }

    const res = await call(row.query, pending);
    const rec = summarize(row, res, turn2, isContinuation);
    done.set(row.id, rec);
    appendFileSync(outPath, JSON.stringify(rec) + "\n");
    ran++;
    consecutiveErrors = rec.actualBehavior === "ERROR" ? consecutiveErrors + 1 : 0;

    const flagMark = rec.actualBehavior === row.expectedBehavior || (row.alsoAcceptable ?? []).includes(rec.actualBehavior as Behavior) ? " " : "*";
    console.error(`${flagMark}${row.id} exp=${row.expectedBehavior.padEnd(7)} act=${String(rec.actualBehavior).padEnd(7)} path=${String(rec.path).padEnd(20)} rows=${String(rec.rowCount).padStart(3)} ${String(res.clientMs).padStart(5)}ms  ${row.query.slice(0, 60)}`);
    if (consecutiveErrors >= 6) throw new Error("6 consecutive transport errors - stopping (results so far are saved; re-run to resume)");
    await sleep(PAUSE_MS);
  }
  console.error(`done: ran ${ran} rows in ${Math.round((Date.now() - startedAt) / 1000)}s; ${done.size}/600 recorded -> ${outPath}`);
}

main().catch((e) => { console.error("FATAL:", e instanceof Error ? e.message : e); process.exit(1); });
