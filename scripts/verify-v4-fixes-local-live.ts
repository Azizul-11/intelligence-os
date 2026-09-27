#!/usr/bin/env tsx
/**
 * V4 fix plan (Batches 1-4) targeted live verification: the WORKING-TREE engine wired exactly like
 * services/domain-registry.ts (Layer 0.5 on, paid normalizer first, the same normalizeQuestion hook and
 * unsupportedPrecheck) against the LIVE warehouse (SELECT-only) and the LIVE model, for the combined row set in
 * --file (the 104 target rows from the four QUERIES_TO_FIX.json files, plus every sentinel row the four
 * BATCH_SPEC.md files name). Serial, --pause ms between rows (default 1200). Output: one JSONL record per row in
 * the sweep's own shape, so score2000.py scores it unchanged (v4 rows already route to score_v3; v1 rows carry
 * their own v3 flag untouched).
 *
 * Usage: pnpm exec tsx scripts/verify-v4-fixes-local-live.ts --file <path> --out <path> [--pause 1200] [--fresh]
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { env } from "./shared/env";
import { healthcareDomain, DOMAIN_CAPABILITIES } from "../domain-packs/healthcare/src/index";
import { HEALTHCARE_FILLER_WORDS } from "../domain-packs/healthcare/src/runtime/lay-vocabulary";
import { describeOverallRatingTies } from "../domain-packs/healthcare/src/runtime/ranking-ties";
import { expandUppercaseStateAbbreviations } from "../domain-packs/healthcare/src/runtime/state-abbreviation-preprocessor";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { SqlExecutor } from "../packages/sql-executor/src/sql-executor";
import { SupabaseDatabaseAdapter } from "../packages/sql-executor/src/supabase-database-adapter";
import { llmGateway, withLlmCallLog } from "../packages/llm-model-gateway/src/llm-model-gateway";
import { normalizeQuestion, precheckUnsupported } from "../supabase/functions/orchestrator/services/normalizer-hook";
import { preflightClarification } from "../supabase/functions/orchestrator/services/conversational";

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const FILE = opt("--file")!;
const OUT = opt("--out")!;
const PAUSE = Number(opt("--pause") ?? 1200);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
process.env.LLM_FIRST_FRONT_DOOR_ENABLED = "true";

const BLUNT = new Set([
  "Unable to resolve question.", "SQL template not found.", "Unable to create query plan.",
  "I don't have enough specific information to identify exactly which record this question refers to. Please include more identifying detail (such as a full name or location) and try again.",
]);
const REDIRECT = "I specialize in US hospital clinical performance and healthcare analytics - I couldn't quite match that to something I track. Here are a few things I can help with:";
const ASKS_USER = /(\?|please (include|specify|provide|tell|clarify)|more (specific|identifying)|which (state|hospital|city|county)|need (a|the) (state|city|county))/i;
const TALLY = ["state", "county", "city", "ownership", "hospital_type", "emergency_services", "birthing_friendly", "measure_code", "overall_rating"];

const runtime = createDomainRuntime(healthcareDomain);
const executor = new SqlExecutor(new SupabaseDatabaseAdapter(createClient(env.supabaseUrl, env.supabaseServiceRoleKey)));
const engine = createRuntimeEngine({
  runtime,
  semantic: createSemanticResolver(runtime.registry, runtime.entityProvider),
  planner: new QueryPlanner({ fillerWords: HEALTHCARE_FILLER_WORDS }),
  executionPlanMapper: new ExecutionPlanMapper(),
  executor,
  preprocessQuestion: expandUppercaseStateAbbreviations,
  llmFallback: (q: string) => normalizeQuestion(q, DOMAIN_CAPABILITIES as any, (text) => llmGateway.normalizeMessyLanguage(text, DOMAIN_CAPABILITIES as any)),
  unsupportedPrecheck: (q: string) => precheckUnsupported(q, DOMAIN_CAPABILITIES as any),
} as any);

function tally(rows: any[], col: string) {
  const m = new Map<string, number>();
  for (const r of rows) { if (!(col in r)) return undefined; const k = r[col] === null || r[col] === undefined ? "∅" : String(r[col]); m.set(k, (m.get(k) ?? 0) + 1); }
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25));
}

async function main() {
  const rows: any[] = JSON.parse(readFileSync(FILE, "utf-8"));
  const done = new Set<string>();
  if (existsSync(OUT) && !args.includes("--fresh")) for (const l of readFileSync(OUT, "utf-8").split("\n").filter(Boolean)) done.add(JSON.parse(l).id);
  else writeFileSync(OUT, "");
  const realLog = console.log;
  const realWarn = console.warn;
  let n = 0;
  let passLike = 0;
  for (const row of rows) {
    if (done.has(row.id)) continue;
    const started = performance.now();
    console.log = () => {};
    console.warn = () => {};
    let r: any;
    let calls: any[] = [];
    let note: string | undefined;
    try {
      const ask = preflightClarification(row.query);
      if (ask) r = { success: false, rows: [], rowCount: 0, error: ask, answerability: { status: "not_directly_answerable" }, trace: [] };
      else ({ result: r, calls } = (await withLlmCallLog(() => engine.execute({ question: row.query } as any))) as any);
      if (r.success) {
        const outRows = (r.rows ?? []) as Record<string, unknown>[];
        note = await describeOverallRatingTies({ rows: outRows, parameters: r.executedParameters, run: (t: any, p: any) => executor.execute(t, p) as any });
      }
    } catch (e) {
      r = { success: false, error: String(e), rows: [], trace: [] };
    }
    console.log = realLog;
    console.warn = realWarn;
    const clientMs = Math.round(performance.now() - started);
    const trace: any[] = r.trace ?? [];
    const exits = trace.filter((t) => t.status !== "enter");
    const norm = [...exits].reverse().find((t) => t.phase === "llm-normalization");
    const outRows: any[] | undefined = r.success ? r.rows ?? [] : undefined;
    const err = r.success ? "" : BLUNT.has(r.error) ? REDIRECT : r.error ?? "";
    let act: string;
    if (r.success) act = "PASS";
    else if (r.answerability?.status === "ambiguous" || norm?.status === "clarification") act = "CLARIFY";
    else if (ASKS_USER.test(err) && !/I specialize in US hospital/.test(err)) act = "CLARIFY";
    else act = "REFUSE";
    const columns = outRows && outRows[0] ? Object.keys(outRows[0]) : [];
    const trim = (x: any) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 70) : v]));
    const rec = {
      id: row.id, category: row.category, group: row.group, query: row.query, expectedBehavior: row.expectedBehavior, alsoAcceptable: row.alsoAcceptable ?? [],
      riskClass: row.riskClass ?? "", expectedIntent: row.expectedIntent, expectedCapability: row.expectedCapability, tags: row.tags ?? [],
      v3: Boolean(row.v3), v4: Boolean(row.v4),
      precededBy: null, turn2: null, continuation: false, at: new Date().toISOString(), http: { status: 200, attempts: 1, clientMs },
      actualBehavior: act, actualStatus: act === "PASS" ? "success" : act === "CLARIFY" ? "needsClarification" : "refusal", success: Boolean(r.success),
      rowCount: outRows?.length ?? 0, requestId: null, metadata: { rowCount: outRows?.length ?? 0, local: true },
      answerability: r.answerability ? { status: r.answerability.status, reason: r.answerability.reason ?? null } : null,
      candidates: r.answerability?.candidates?.length ? r.answerability.candidates.map((c: any) => c.label) : null,
      path: norm ? "layer0.5-llm" : calls.some((c) => c.role === "normalizer") ? "layer1-on-failure" : "deterministic-bypass",
      normalization: norm ? { status: norm.status, detail: norm.detail ?? null } : null,
      trace: exits.map((t) => ({ phase: t.phase, status: t.status, sqlCalls: t.sqlCalls ?? 0, detail: t.detail })),
      traceSqlSum: 0, sqlReached: Boolean(r.success), llmCalls: calls,
      error: err || null, answerText: outRows ? null : err.slice(0, 700), summary: note ?? null, suggestions: [],
      observed: outRows ? { columns, n: outRows.length, tallies: Object.fromEntries(TALLY.filter((c) => columns.includes(c)).map((c) => [c, tally(outRows, c)])), head: outRows.slice(0, 15).map(trim), tail: outRows.length > 15 ? outRows.slice(-3).map(trim) : [] } : null,
      executedParameters: r.executedParameters ?? null, leakFlag: null,
    };
    appendFileSync(OUT, JSON.stringify(rec) + "\n");
    n++;
    const okLike = act === row.expectedBehavior || (row.alsoAcceptable ?? []).includes(act);
    passLike += okLike ? 1 : 0;
    const mark = okLike ? " " : "*";
    realLog(`${mark}${row.id.padEnd(9)} exp=${row.expectedBehavior.padEnd(9)} act=${act.padEnd(9)} rows=${String(rec.rowCount).padStart(3)} ${String(clientMs).padStart(6)}ms ${(note ?? "").slice(0, 50)} | ${row.query.slice(0, 60)}`);
    await sleep(PAUSE);
  }
  realLog(`done ${n} rows, ${passLike} behavior-matched -> ${OUT}`);
  process.exit(0);
}
main();
