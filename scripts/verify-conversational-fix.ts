#!/usr/bin/env tsx
/**
 * ConversationalFix (2026-09-27) targeted live verification: the WORKING-TREE engine wired exactly like
 * services/domain-registry.ts (llmFallback, unsupportedPrecheck, and the new conversationalCheck hook), against
 * the LIVE model (free FALLBACK_CHAIN classification + handleConversational) and the LIVE warehouse (SELECT-only,
 * only reached for the sentinel rows that must still execute SQL).
 *
 * Covers exactly what AUDIT_CONVERSATIONAL_INTENT_ROUTING.md's approved fix needed to prove:
 *  - the 4 informal/typo phrasings the front-door regex never covered now resolve conversational, 0 SQL
 *  - the sentinels the new hook must never swallow: C048 (an analytical question that merely starts with "hi"),
 *    F010/F011 (off-topic but NOT conversational - must stay refused, never onboarded)
 *
 * F012-F015 (the regex-caught rows) are deliberately NOT re-tested here - services/conversational.ts itself was
 * not touched this batch, and verify-batch1-word-drop-guards.ts (in the battery) already proves that set exactly.
 *
 * Usage: pnpm exec tsx scripts/verify-conversational-fix.ts [--live]
 * --live: hits the DEPLOYED orchestrator function over HTTP instead of the working-tree engine directly.
 */
import { createClient } from "@supabase/supabase-js";
import { env } from "./shared/env";

const LIVE = process.argv.includes("--live");
const ORCHESTRATOR_URL = `${env.supabaseUrl.replace(/\/$/, "")}/functions/v1/orchestrator`;
import { healthcareDomain, DOMAIN_CAPABILITIES } from "../domain-packs/healthcare/src/index";
import { HEALTHCARE_FILLER_WORDS } from "../domain-packs/healthcare/src/runtime/lay-vocabulary";
import { expandUppercaseStateAbbreviations } from "../domain-packs/healthcare/src/runtime/state-abbreviation-preprocessor";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { SqlExecutor } from "../packages/sql-executor/src/sql-executor";
import { SupabaseDatabaseAdapter } from "../packages/sql-executor/src/supabase-database-adapter";
import { llmGateway } from "../packages/llm-model-gateway/src/llm-model-gateway";
import { normalizeQuestion, precheckUnsupported } from "../supabase/functions/orchestrator/services/normalizer-hook";

process.env.LLM_FIRST_FRONT_DOOR_ENABLED = "true";

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
  conversationalCheck: async (question: string) => {
    const intent = await llmGateway.classifyConversationalIntent(question, DOMAIN_CAPABILITIES as any);
    return intent === "conversational" ? llmGateway.handleConversational(question, DOMAIN_CAPABILITIES as any) : undefined;
  },
} as any);

interface Case {
  id: string;
  query: string;
  expect: "conversational" | "analytical-success" | "analytical-refused";
}

const CASES: Case[] = [
  { id: "NEW1", query: "what i can searh here", expect: "conversational" },
  { id: "NEW2", query: "Tell me somthing", expect: "conversational" },
  { id: "NEW3", query: "what's up", expect: "conversational" },
  { id: "NEW4", query: "bro", expect: "conversational" },
  { id: "C048", query: "hi show me hospitals in HI", expect: "analytical-success" },
  { id: "F010", query: "who is the president in Texas?", expect: "analytical-refused" },
  { id: "F011", query: "stock price in Texas", expect: "analytical-refused" },
];

async function main() {
  let pass = 0;
  let fail = 0;
  const startedAll = Date.now();

  for (const c of CASES) {
    const started = performance.now();
    let result: any;
    let conversationalAnswer: string | undefined;

    if (LIVE) {
      const res = await fetch(ORCHESTRATOR_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: env.supabaseAnonKey, Authorization: `Bearer ${env.supabaseAnonKey}` },
        body: JSON.stringify({ question: c.query }),
      });
      const body = await res.json();
      const parsedRowCount = (() => {
        try {
          return body.success ? (JSON.parse(body.answer || "[]") as unknown[]).length : 0;
        } catch {
          return 0; // `answer` is plain conversational text, not a JSON row array - 0 rows either way.
        }
      })();
      result = { success: body.success, rowCount: body.metadata?.rowCount ?? parsedRowCount, answerability: body.answerability, error: body.error, trace: body.trace };
      conversationalAnswer = body.answerability?.status === "conversational" ? body.answer : undefined;
    } else {
      result = await engine.execute({ question: c.query } as any);
      conversationalAnswer = (result as any).conversationalAnswer;
    }

    const ms = Math.round(performance.now() - started);
    const status = result.answerability?.status;

    let ok: boolean;
    if (c.expect === "conversational") {
      ok = status === "conversational" && result.success === true && result.rowCount === 0 && typeof conversationalAnswer === "string" && conversationalAnswer.length > 0;
    } else if (c.expect === "analytical-success") {
      ok = status !== "conversational" && result.success === true && result.rowCount > 0;
    } else {
      ok = status !== "conversational" && result.success === false;
    }

    pass += ok ? 1 : 0;
    fail += ok ? 0 : 1;
    const mark = ok ? "PASS" : "FAIL";
    console.log(
      `[${mark}] ${c.id.padEnd(6)} status=${String(status).padEnd(14)} success=${String(result.success).padEnd(5)} rows=${String(result.rowCount).padStart(3)} ${String(ms).padStart(6)}ms | "${c.query}"` +
        (c.expect === "conversational" ? ` -> "${conversationalAnswer?.slice(0, 90) ?? ""}"` : ""),
    );
    if (!ok) {
      console.log(`  error: ${result.error}`);
      console.log(`  trace: ${JSON.stringify((result.trace ?? []).map((t: any) => ({ phase: t.phase, status: t.status, detail: t.detail })))}`);
    }
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed (${CASES.length} total) in ${Math.round((Date.now() - startedAll) / 1000)}s`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
