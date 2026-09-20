/**
 * 2026-09-19 - per-request LLM call log + wall-clock deadline for the gateway.
 *
 * Why: live, a query took 10-44 s because the un-timed summary role walked the
 * free chain tier by tier (each with retries), and nothing in the UI said which
 * LLM was slow. Two changes are proven here, with NO network and NO cost (fetch
 * is stubbed; every test builds its own tiers so circuit breakers never leak
 * between cases):
 *
 *  D. `deadlineMs` bounds the WHOLE chain traversal (a hanging tier is cut at the
 *     remaining budget, no later tier is started once it is spent) and leaves
 *     behaviour untouched when unset.
 *  L. `withLlmCallLog` returns one record per gateway call made inside it, per
 *     request (safe under concurrency), for all four roles.
 *
 * Run: npx tsx scripts/verify-llm-deadline-and-call-log.ts
 */
import {
  AICREDITS_QWEN_30B_TIER,
  AICREDITS_QWEN_FLASH_TIER,
  LLMModelGateway,
  withLlmCallLog,
  type LlmCallRecord,
} from "../packages/llm-model-gateway/src/llm-model-gateway";
import { DOMAIN_CAPABILITIES } from "../domain-packs/healthcare/src/runtime/capability-catalog";

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

const FLASH_MODEL = AICREDITS_QWEN_FLASH_TIER.model;
const SECOND_MODEL = AICREDITS_QWEN_30B_TIER.model;
const rows = [{ hospital_name: "A", overall_rating: 5 }];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let tierSeq = 0;
/** A fresh copy of a real paid tier: own keyId/circuit (tests stay independent), fake key, same model + timeout. */
function tier(base: typeof AICREDITS_QWEN_FLASH_TIER) {
  tierSeq += 1;
  return { ...base, apiKey: "test-key-not-real", keyId: `${base.keyId}-t${tierSeq}`, circuitKey: `${base.circuitKey}-t${tierSeq}` };
}

type Out = { status: number; body: unknown; delayMs?: number } | { hang: true };
type Call = { model: string; system: string };

const completion = (content: string) => ({ choices: [{ message: { content } }] });
/** Content shaped for whichever role is asking (the prompts are the only thing that differs). */
function contentFor(system: string): string {
  if (system.includes("Summarize this table")) return "One hospital, rated 5.";
  if (system.includes("suggestion selector")) return JSON.stringify(["s1", "s2", "s3"]);
  if (system.includes("suggestion-phrasing")) return JSON.stringify(["s1", "s2", "s3"]);
  if (system.includes("casual message")) return JSON.stringify({ answer: "Hi!", suggestions: ["q1", "q2"] });
  return JSON.stringify({ status: "ok", canonical_question: "Show me hospitals in Texas", reason: null });
}
const okBy = () => ({ status: 200, body: null }); // body filled per call below

async function withStub(handler: (call: Call) => Out, run: (calls: Call[]) => Promise<void>) {
  const calls: Call[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init: { body?: string } | undefined) => {
    const parsed = init?.body ? JSON.parse(init.body) : {};
    const call: Call = { model: parsed.model, system: parsed.messages?.[0]?.content ?? "" };
    calls.push(call);
    const out = handler(call);
    if ("hang" in out) return new Promise<Response>(() => undefined);
    if (out.delayMs) await sleep(out.delayMs);
    const json = out.body === null ? completion(contentFor(call.system)) : out.body;
    return new Response(JSON.stringify(json), { status: out.status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    await run(calls);
  } finally {
    globalThis.fetch = previous;
  }
}
const isFlash = (c: Call) => c.model === FLASH_MODEL;
const isSecond = (c: Call) => c.model === SECOND_MODEL;
const rateLimited = () => ({ status: 429, body: { error: { message: "rate limited" } } });

async function main() {
  console.log("\n--- D. Deadline ---");

  {
    const flash = tier(AICREDITS_QWEN_FLASH_TIER);
    const second = tier(AICREDITS_QWEN_30B_TIER);
    await withStub((c) => (isFlash(c) ? { hang: true } : okBy()), async (calls) => {
      const gw = new LLMModelGateway([flash, second]);
      const t0 = Date.now();
      const { result, calls: log } = await withLlmCallLog(() => gw.summarizeResult("q", rows, 800));
      const elapsed = Date.now() - t0;
      check("D1", `first tier hangs, 800 ms budget -> cut at the budget (${elapsed} ms), later tier NEVER started, summary is "" (caller treats as absent)`,
        result === "" && elapsed >= 750 && elapsed < 1300 && calls.length === 1 && !calls.some(isSecond), `elapsed=${elapsed} calls=${calls.length} result=${JSON.stringify(result)}`);
      check("D1b", "and the call is still recorded, as failed: role summary, provider none, 1 attempt, the tier it tried",
        log.length === 1 && log[0]?.role === "summary" && log[0].provider === "none" && log[0].attempts === 1 && log[0].tiers === flash.keyId && log[0].latencyMs >= 750,
        JSON.stringify(log));
    });
  }

  {
    const flash = tier(AICREDITS_QWEN_FLASH_TIER);
    await withStub(okBy, async () => {
      const { result, calls: log } = await withLlmCallLog(() => new LLMModelGateway([flash]).summarizeResult("q", rows, 3500));
      check("D2", "healthy first tier inside the budget -> summary returned, recorded as answered by that tier with no fallback",
        result === "One hospital, rated 5." && log[0]?.provider === "aicredits" && log[0].model === FLASH_MODEL && log[0].keyId === flash.keyId && log[0].fallbackUsed === false,
        JSON.stringify({ result, log }));
    });
  }

  {
    const flash = tier(AICREDITS_QWEN_FLASH_TIER);
    const second = tier(AICREDITS_QWEN_30B_TIER);
    await withStub((c) => (isFlash(c) ? rateLimited() : okBy()), async (calls) => {
      const { result, calls: log } = await withLlmCallLog(() => new LLMModelGateway([flash, second]).summarizeResult("q", rows, 3500));
      check("D3", "first tier 429 (instant) -> the second tier still answers inside the budget; record shows the fallback and both tiers tried",
        result === "One hospital, rated 5." && calls.filter(isFlash).length === 1 && log[0]?.keyId === second.keyId && log[0].fallbackUsed === true && log[0].tiers === `${flash.keyId}>${second.keyId}` && log[0].attempts === 2,
        JSON.stringify({ result, log }));
    });
  }

  {
    const flash = tier(AICREDITS_QWEN_FLASH_TIER);
    const second = tier(AICREDITS_QWEN_30B_TIER);
    await withStub((c) => (isFlash(c) ? { hang: true } : okBy()), async (calls) => {
      const t0 = Date.now();
      const result = await new LLMModelGateway([flash, second]).summarizeResult("q", rows);
      const elapsed = Date.now() - t0;
      check("D4", `NO deadline given -> behaviour unchanged: the hanging tier is cut at ITS OWN timeout (3 s), then the next tier answers (${elapsed} ms)`,
        result === "One hospital, rated 5." && elapsed >= 2900 && elapsed < 4500 && calls.filter(isFlash).length === 1 && calls.filter(isSecond).length === 1, `elapsed=${elapsed}`);
    });
  }

  {
    const flash = tier(AICREDITS_QWEN_FLASH_TIER);
    const second = tier(AICREDITS_QWEN_30B_TIER);
    await withStub((c) => (isFlash(c) ? rateLimited() : { hang: true }), async () => {
      const t0 = Date.now();
      const result = await new LLMModelGateway([flash, second]).summarizeResult("q", rows, 1000);
      const elapsed = Date.now() - t0;
      check("D5", `deadline also caps a LATER tier's own timeout: 429 then a tier that would hang 4 s -> total ${elapsed} ms, not 4 s`,
        result === "" && elapsed >= 950 && elapsed < 1500, `elapsed=${elapsed}`);
    });
  }

  {
    const flash = tier(AICREDITS_QWEN_FLASH_TIER);
    await withStub(() => ({ hang: true }), async (calls) => {
      const t0 = Date.now();
      const { result, calls: log } = await withLlmCallLog(() => new LLMModelGateway([flash]).selectAndRephraseSuggestions(["a", "b", "c", "d"], {}, 3, 700));
      const elapsed = Date.now() - t0;
      check("D6", `suggestion selection honours its deadline (${elapsed} ms) and returns the deterministic first 3 unchanged, recorded as failed`,
        JSON.stringify(result) === JSON.stringify(["a", "b", "c"]) && elapsed >= 650 && elapsed < 1200 && calls.length === 1 && log[0]?.role === "suggestions" && log[0].provider === "none",
        JSON.stringify({ result, elapsed, log }));
    });
  }

  {
    const flash = tier(AICREDITS_QWEN_FLASH_TIER);
    await withStub(() => ({ hang: true }), async () => {
      const t0 = Date.now();
      const result = await new LLMModelGateway([flash]).synthesizeSuggestions({ question: "q", candidates: ["a", "b", "c"] }, 700);
      const elapsed = Date.now() - t0;
      check("D7", `suggestion rephrase honours its deadline (${elapsed} ms) and returns the candidates unchanged`, JSON.stringify(result) === JSON.stringify(["a", "b", "c"]) && elapsed >= 650 && elapsed < 1200, `elapsed=${elapsed} result=${JSON.stringify(result)}`);
    });
  }

  console.log("\n--- L. Call log ---");

  {
    const flash = tier(AICREDITS_QWEN_FLASH_TIER);
    await withStub(okBy, async () => {
      const gw = new LLMModelGateway([flash]);
      const { calls: log } = await withLlmCallLog(async () => {
        await gw.normalizeMessyLanguage("hospitals in tx", DOMAIN_CAPABILITIES);
        await gw.summarizeResult("q", rows, 3500);
        await gw.selectAndRephraseSuggestions(["a", "b", "c", "d"], {}, 3, 1800);
        await gw.handleConversational("hi", DOMAIN_CAPABILITIES);
      });
      const roles = log.map((r: LlmCallRecord) => r.role).join(",");
      check("L1", `one request -> one record per gateway call, all four roles, in order (${roles})`,
        roles === "normalizer,summary,suggestions,conversational" && log.every((r) => r.provider === "aicredits" && r.model === FLASH_MODEL && r.attempts === 1 && r.latencyMs >= 0),
        JSON.stringify(log));
    });
  }

  {
    const flash = tier(AICREDITS_QWEN_FLASH_TIER);
    await withStub((c) => (c.system.includes("Summarize this table") ? { status: 200, body: null, delayMs: 250 } : okBy()), async () => {
      const gw = new LLMModelGateway([flash]);
      const [a, b] = await Promise.all([
        withLlmCallLog(() => gw.summarizeResult("q", rows, 3500)),
        withLlmCallLog(() => gw.normalizeMessyLanguage("hospitals in tx", DOMAIN_CAPABILITIES)),
      ]);
      check("L2", "two requests running concurrently in one process never see each other's calls (request A: only summary, request B: only normalizer)",
        a.calls.length === 1 && a.calls[0]?.role === "summary" && b.calls.length === 1 && b.calls[0]?.role === "normalizer", JSON.stringify({ a: a.calls.map((c) => c.role), b: b.calls.map((c) => c.role) }));
    });
  }

  {
    const flash = tier(AICREDITS_QWEN_FLASH_TIER);
    await withStub(okBy, async () => {
      const result = await new LLMModelGateway([flash]).summarizeResult("q", rows, 3500);
      check("L3", "a role call made OUTSIDE any withLlmCallLog scope works exactly as before (nothing to record into, nothing thrown)", result === "One hospital, rated 5.", JSON.stringify(result));
    });
  }

  {
    const flash = tier(AICREDITS_QWEN_FLASH_TIER);
    await withStub(() => ({ status: 500, body: { error: "down" } }), async () => {
      const { result, calls: log } = await withLlmCallLog(() => new LLMModelGateway([flash]).normalizeMessyLanguage("hospitals in tx", DOMAIN_CAPABILITIES));
      check("L4", "normalizer with every tier down: still returns the honest fallback AND is recorded as failed (provider none)",
        result.status === "fallback" && log.length === 1 && log[0]?.role === "normalizer" && log[0].provider === "none", JSON.stringify({ result, log }));
    });
  }

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
