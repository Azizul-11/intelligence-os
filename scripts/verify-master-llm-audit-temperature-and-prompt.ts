/**
 * Master LLM Audit (2026-09-15) — per-method temperature + normalizeMessyLanguage
 * prompt robustness verification.
 *
 * Confirms:
 * 1. normalizeMessyLanguage is now far more consistent run-to-run at temperature 0.1
 *    (previously 0.9 shared across all methods, confirmed non-deterministic for the
 *    same "goverment hospital in CA" input in the prior Bug L investigation).
 * 2. "goverment hospital in CA" preserves BOTH the ownership filter AND the state
 *    filter in the LLM's own rewrite (previously observed dropping one or the other).
 * 3. "hospital in CA" (bare geographic list, no metric) rewrites to a real answerable
 *    question instead of the "I couldn't quite match that" dead end.
 * 4. Bug L's own already-fixed deterministic cases (good safety/saftey, spelled-out
 *    state ownership typo) are unaffected.
 *
 * This calls the LLM gateway directly (real network calls, free-tier quota) - run
 * sparingly. Run: npx tsx scripts/verify-master-llm-audit-temperature-and-prompt.ts
 */
import "dotenv/config";
import { llmGateway } from "../packages/llm-model-gateway/src/llm-model-gateway";
import { DOMAIN_CAPABILITIES } from "../domain-packs/healthcare/src/index";

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

async function rewrite(question: string) {
  return llmGateway.normalizeMessyLanguage(question, DOMAIN_CAPABILITIES);
}

async function main() {
  console.log("=".repeat(100));
  console.log("MASTER LLM AUDIT — TEMPERATURE + PROMPT VERIFICATION");
  console.log("=".repeat(100));

  console.log("\n--- Determinism check: 3 calls, same input, temperature 0.1 ---");
  const runs = await Promise.all([
    rewrite("goverment hospital in CA"),
    rewrite("goverment hospital in CA"),
    rewrite("goverment hospital in CA"),
  ]);
  runs.forEach((r, i) => console.log(`    run ${i + 1}: status=${r.status} canonical=${JSON.stringify(r.canonical_question)}`));
  const allPreserveBoth = runs.every(
    (r) =>
      r.status === "ok" &&
      r.canonical_question &&
      /government/i.test(r.canonical_question) &&
      /california/i.test(r.canonical_question),
  );
  check(
    "DET-1",
    "'goverment hospital in CA' preserves BOTH government + California across 3 separate calls",
    allPreserveBoth,
    JSON.stringify(runs.map((r) => r.canonical_question)),
  );

  console.log("\n--- Geographic list without metric ---");
  const bareCA = await rewrite("hospital in CA");
  console.log(`    "hospital in CA" -> status=${bareCA.status} canonical=${JSON.stringify(bareCA.canonical_question)}`);
  check(
    "GEO-1",
    "'hospital in CA' rewrites to a real answerable California hospitals question",
    bareCA.status === "ok" && !!bareCA.canonical_question && /california/i.test(bareCA.canonical_question) && /hospitals/i.test(bareCA.canonical_question),
    `status=${bareCA.status} canonical=${bareCA.canonical_question} reason=${bareCA.reason}`,
  );

  const showBareCA = await rewrite("show me hospital in CA");
  console.log(`    "show me hospital in CA" -> status=${showBareCA.status} canonical=${JSON.stringify(showBareCA.canonical_question)}`);
  check(
    "GEO-2",
    "'show me hospital in CA' rewrites to a real answerable California hospitals question",
    showBareCA.status === "ok" && !!showBareCA.canonical_question && /california/i.test(showBareCA.canonical_question),
    `status=${showBareCA.status} canonical=${showBareCA.canonical_question}`,
  );

  console.log("\n--- Regression: Bug L's own already-fixed cases (should still work via LLM path too) ---");
  const goodSafety = await rewrite("show me hospital with good safety");
  console.log(`    "show me hospital with good safety" -> status=${goodSafety.status} canonical=${JSON.stringify(goodSafety.canonical_question)}`);
  check(
    "REG-1",
    "'good safety' still rewrites correctly (no state, ranking)",
    goodSafety.status === "ok" && !!goodSafety.canonical_question && /safety/i.test(goodSafety.canonical_question),
    `status=${goodSafety.status} canonical=${goodSafety.canonical_question}`,
  );

  const govCalifornia = await rewrite("goverment hospital in california");
  console.log(`    "goverment hospital in california" -> status=${govCalifornia.status} canonical=${JSON.stringify(govCalifornia.canonical_question)}`);
  check(
    "REG-2",
    "'goverment hospital in california' (spelled-out) still preserves both filters",
    govCalifornia.status === "ok" && !!govCalifornia.canonical_question && /government/i.test(govCalifornia.canonical_question) && /california/i.test(govCalifornia.canonical_question),
    `status=${govCalifornia.status} canonical=${govCalifornia.canonical_question}`,
  );

  console.log("\n--- Control: unrelated existing behavior must be unaffected ---");
  const mortalityControl = await rewrite("Which hospitals have the lowest mortality rates?");
  console.log(`    control -> status=${mortalityControl.status} canonical=${JSON.stringify(mortalityControl.canonical_question)}`);
  check(
    "CTRL-1",
    "unrelated control question still rewrites sensibly",
    mortalityControl.status === "ok" && !!mortalityControl.canonical_question && /mortality/i.test(mortalityControl.canonical_question),
    `status=${mortalityControl.status} canonical=${mortalityControl.canonical_question}`,
  );

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
