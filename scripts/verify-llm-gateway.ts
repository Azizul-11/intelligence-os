/**
 * LLM-ModelGateway — direct gateway verification.
 *
 * Live smoke test against the real, currently-configured free-tier
 * providers (Groq/Google/OpenRouter/NVIDIA) plus a forced-failure test
 * proving the failover loop actually advances tiers and terminates.
 *
 * Run: npx tsx scripts/verify-llm-gateway.ts
 */
// Must load before the gateway module - FALLBACK_CHAIN reads
// process.env.* eagerly at import time (same pattern scripts/shared/env.ts
// already establishes for every other verify-*.ts script).
import "dotenv/config";
import { llmGateway, LLMModelGateway } from "../packages/llm-model-gateway/src/llm-model-gateway";

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

async function main() {
  console.log("=".repeat(100));
  console.log("LLM-MODELGATEWAY DIRECT VERIFICATION");
  console.log("=".repeat(100));

  console.log("\n--- Group A: real live provider call (whichever tier is healthy serves it) ---");
  {
    const result = await llmGateway.complete(
      "You are a terse test assistant. Reply with exactly one word.",
      "Reply with the single word: PONG",
    );
    console.log(`    raw reply: ${JSON.stringify(result)}`);
    check("A1-LIVE-COMPLETE", "gateway returns a non-empty string from a real provider", typeof result === "string" && result.length > 0, `result=${JSON.stringify(result)}`);
  }

  console.log("\n--- Group B: real live JSON round trip (Layer 1 shape) ---");
  {
    const result = await llmGateway.normalizeMessyLanguage("hospitals with best safeties");
    console.log(`    normalizeMessyLanguage: ${JSON.stringify(result)}`);
    check("B1-STATUS-VALID", "status is one of ok/need_clarification/fallback", ["ok", "need_clarification", "fallback"].includes(result.status), JSON.stringify(result));
    check(
      "B1-CANONICAL-BOUNDED",
      "if status=ok, canonical_question mentions a real declared metric",
      result.status !== "ok" || /overall rating|mortality|readmission|patient experience|safety performance/i.test(result.canonical_question ?? ""),
      JSON.stringify(result),
    );
  }
  {
    const result = await llmGateway.normalizeMessyLanguage("what is the weather like today?");
    console.log(`    normalizeMessyLanguage (off-topic): ${JSON.stringify(result)}`);
    check("B2-OFFTOPIC-NOT-OK", "genuinely off-topic input never returns status=ok", result.status !== "ok", JSON.stringify(result));
  }

  console.log("\n--- Group C: real live suggestion rephrasing (Layer 2 shape) ---");
  {
    const candidates = [
      "Show me hospitals with best Mortality Rate in Texas",
      "Show me non-profit hospitals with best Hospital Overall Rating",
      "Best hospitals in Texas and California",
    ];
    const result = await llmGateway.synthesizeSuggestions({
      question: "Best hospitals in Texas",
      resolvedMetric: "Hospital Overall Rating",
      resolvedState: "Texas",
      candidates,
    });
    console.log(`    synthesizeSuggestions: ${JSON.stringify(result)}`);
    check("C1-SAME-LENGTH", "rephrased list has the same length as input", result.length === candidates.length, `got ${result.length}, want ${candidates.length}`);
    check("C1-NON-EMPTY-STRINGS", "every rephrased entry is a non-empty string", result.every((s) => typeof s === "string" && s.length > 0), JSON.stringify(result));
  }

  console.log("\n--- Group D: real live summary (Layer 3 shape) ---");
  {
    const rows = [
      { hospital_name: "ASCENSION SETON HIGHLAND LAKES", city: "BURNET", state: "TX", overall_rating: "5" },
      { hospital_name: "HOUSTON METHODIST HOSPITAL", city: "HOUSTON", state: "TX", overall_rating: "5" },
    ];
    const summary = await llmGateway.summarizeResult("Best hospitals in Texas", rows);
    console.log(`    summarizeResult: ${JSON.stringify(summary)}`);
    check("D1-NON-EMPTY", "summary is produced for a non-empty row set", summary.length > 0, summary);
  }

  console.log("\n--- Group E: forced-failure chain termination (no real network) ---");
  {
    // A gateway instance whose chain is deliberately every tier
    // misconfigured (bad baseURL/no key) except the final mock tier -
    // proves the loop advances through every tier and terminates
    // (throws) rather than hanging, and that the 3 role methods each
    // catch that and apply their own documented deterministic fallback.
    const brokenGateway = new LLMModelGateway([
      { provider: "groq", model: "llama-3.3-70b-versatile", apiKey: undefined, baseURL: "https://api.groq.com/openai/v1", timeoutMs: 500, maxRetries: 0, keyId: "test-broken-groq", isFree: true },
      { provider: "mock", model: "deterministic-fallback", timeoutMs: 0, maxRetries: 0, keyId: "test-mock", isFree: true },
    ]);

    const l1 = await brokenGateway.normalizeMessyLanguage("hospitals with best safeties");
    check("E1-LAYER1-FALLBACK", "Layer 1 falls back to status=fallback when every provider is unavailable", l1.status === "fallback", JSON.stringify(l1));

    const candidates = ["Show me hospitals with best Mortality Rate in Texas"];
    const l2 = await brokenGateway.synthesizeSuggestions({ question: "x", candidates });
    check("E2-LAYER2-FALLBACK", "Layer 2 returns the original candidates unchanged when every provider is unavailable", JSON.stringify(l2) === JSON.stringify(candidates), JSON.stringify(l2));

    const l3 = await brokenGateway.summarizeResult("x", [{ a: 1 }]);
    check("E3-LAYER3-FALLBACK", "Layer 3 returns an empty string when every provider is unavailable", l3 === "", JSON.stringify(l3));
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
