/**
 * Phase 3.6 (LLM-First Front Door, 2026-09-18) — Layer 0.5 verification.
 *
 * Sets LLM_FIRST_FRONT_DOOR_ENABLED=true (the feature flag defaults to
 * OFF in production - see create-runtime-engine.ts's
 * isLlmFirstFrontDoorEnabled()) and exercises the LLM-wired engine
 * (real llmFallback, same adapter shape as
 * supabase/functions/orchestrator/services/domain-registry.ts) against:
 *
 * 1. New-capability cases from docs/LLM-FIRST-FRONT/
 *    04_50_PLUS_QUERIES_ANSWERABLE_AFTER_LLM_FIRST.md - a representative
 *    cross-section of the "[projected]" rows (clinical colloquialisms,
 *    city typos), now converted into real assertions against a live
 *    LLM-wired engine.
 * 2. Non-regression controls - queries that already worked deterministically
 *    before this change must return the identical shape with the flag ON.
 * 3. Ambiguity/off-topic MUST-still-refuse cases, proven with a spy
 *    executor counting real SQL calls - the Phase 8.13 invariant
 *    (`ambiguous|not_directly_answerable ⟹ SQL=0`) re-verified under the
 *    new ordering, not just assumed from the code's structure.
 *
 * 4. Layer 0.5 hardening + hidden-call leak fix (LLM call-count audit
 *    R1/R2, 2026-09-18) - sections G-K: suggestion dry-runs make ZERO
 *    LLM-fallback calls, every suggestion-pool candidate is answerable,
 *    the Houston/Houson/heart-pain frontend failures, state-code case
 *    variants, a size ceiling on the normalizer prompt, and proof that a tier
 *    measured unsafe for rewriting is never asked to rewrite.
 *
 * Run: npx tsx scripts/verify-llm-first-front-door.ts
 */
process.env.LLM_FIRST_FRONT_DOOR_ENABLED = "true";

import "dotenv/config";

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
import { FALLBACK_CHAIN, LLMModelGateway, llmGateway } from "../packages/llm-model-gateway/src/llm-model-gateway";
// The healthcare domain pack imports "@intelligence/llm-model-gateway", which
// resolves to this package's built dist - NOT the src instance imported above.
// Patching Layer 2's suggestion LLM call (section G) must target that same
// singleton, or the patch silently never fires.
import { llmGateway as distLlmGateway } from "../packages/llm-model-gateway/dist/index.js";
import { env } from "./shared/env";

// Same adapter shape as domain-registry.ts's real production wiring -
// not a re-implementation, the identical mapping logic.
async function llmFallback(question: string) {
  const result = await llmGateway.normalizeMessyLanguage(question, DOMAIN_CAPABILITIES);
  if (result.status === "fallback" && result.reason === "LLM gateway unavailable") {
    llmUnavailableCalls++;
  }
  await pace();
  if (result.status === "ok" && result.canonical_question) {
    return { canonicalQuestion: result.canonical_question };
  }
  if (result.status === "need_clarification" && result.reason) {
    return { clarification: result.reason };
  }
  return null;
}

type FallbackFn = typeof llmFallback;

// A llmFallback that only counts calls - no network, no rewrite. Lets a test
// prove WHETHER the engine reached for the LLM, independent of what it says.
function makeCountingFallback() {
  const counter = { calls: 0 };
  const fn: FallbackFn = async () => {
    counter.calls++;
    return null;
  };
  return { counter, fn };
}

// Groq's free tier is capped per minute; space out real-LLM calls (paced
// inside llmFallback) so a 429 burst is not mistaken for a behavior
// regression (root-caused in Stage 1).
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const pace = () => sleep(Number(process.env.VERIFY_PACE_MS ?? 4000));

function makeRealEngine(fallback: FallbackFn | null = llmFallback) {
  const runtime = createDomainRuntime(healthcareDomain);
  const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
  const planner = new QueryPlanner();
  const mapper = new ExecutionPlanMapper();
  const client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  const executor = new SqlExecutor(new SupabaseDatabaseAdapter(client));

  return createRuntimeEngine({
    runtime,
    semantic,
    planner,
    executionPlanMapper: mapper,
    executor,
    preprocessQuestion: expandUppercaseStateAbbreviations,
    ...(fallback ? { llmFallback: fallback } : {}),
  });
}

function makeSpyEngine(spy: { callCount: number }, fallback: FallbackFn | null = llmFallback) {
  const runtime = createDomainRuntime(healthcareDomain);
  const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
  const planner = new QueryPlanner();
  const mapper = new ExecutionPlanMapper();

  const spyExecutor = {
    async execute() {
      spy.callCount++;
      return { success: true, rows: [{ facility_id: "mock", value: 5 }], rowCount: 1 };
    },
  };

  return createRuntimeEngine({
    runtime,
    semantic,
    planner,
    executionPlanMapper: mapper,
    executor: spyExecutor as any,
    preprocessQuestion: expandUppercaseStateAbbreviations,
    ...(fallback ? { llmFallback: fallback } : {}),
  });
}

let pass = 0;
let fail = 0;
// Free-tier LLM quota is a known, documented limit (Groq 200K tokens/day per
// model; the other free tiers 429/503). A failure that coincides with the
// gateway reporting "all providers unavailable" is quota, not logic - it is
// flagged so it is never misread as a behavior regression. Those cases are
// re-run once the paid provider is wired in.
let llmUnavailableCalls = 0;
let unavailableAtLastCheck = 0;
let quotaFails = 0;
function check(id: string, label: string, condition: boolean, detail: string) {
  const quotaHit = llmUnavailableCalls > unavailableAtLastCheck;
  unavailableAtLastCheck = llmUnavailableCalls;
  if (condition) {
    pass++;
    console.log(`  [PASS] ${id} ${label}`);
  } else {
    fail++;
    if (quotaHit) quotaFails++;
    console.log(`  [FAIL] ${id} ${label} -- ${detail}${quotaHit ? "  << LLM UNAVAILABLE (rate limit) during this case - quota, not logic" : ""}`);
  }
}

async function main() {
  console.log("=".repeat(100));
  console.log("LLM-FIRST FRONT DOOR (Layer 0.5) — VERIFICATION — flag=ON, real LLM calls");
  console.log("=".repeat(100));

  const engine = makeRealEngine();

  console.log("\n--- A. Clinical colloquialisms (new capability) ---");
  {
    const r = await engine.execute({ question: "show me hospital for heart pain" });
    const rows = (r.rows as Record<string, unknown>[]) ?? [];
    const codes = [...new Set(rows.map((row) => row["measure_code"]))];
    console.log(`    [A1] "show me hospital for heart pain" -> success=${r.success} rowCount=${r.rowCount} measureCodes=${JSON.stringify(codes)}`);
    check("A1", '"show me hospital for heart pain" -> resolves to AMI mortality', r.success === true && codes.length === 1 && codes[0] === "MORT_30_AMI", `success=${r.success} codes=${JSON.stringify(codes)}`);
  }
  {
    const r = await engine.execute({ question: "my chest hurts need good hospital" });
    console.log(`    [A2] "my chest hurts need good hospital" -> success=${r.success} rowCount=${r.rowCount}`);
    check("A2", '"my chest hurts need good hospital" -> answerable', r.success === true, `success=${r.success}`);
  }
  {
    const r = await engine.execute({ question: "hospital for heart pain Texas" });
    const rows = (r.rows as Record<string, unknown>[]) ?? [];
    check("A3", '"hospital for heart pain Texas" -> scoped to TX', r.success === true && rows.every((row) => row["state"] === "TX"), `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "lung disease" });
    console.log(`    [A4] "lung disease" (plain wording, mapped) -> success=${r.success}`);
    // Batch 5A-1 (D1/D3): this used to assert the Rule 4c refusal ("deliberately ambiguous, same class as heart issue").
    // Plain wording is mapped now (lung disease -> COPD mortality, with a note), never refused.
    check("A4", '"lung disease" -> mapped to COPD mortality (plain wording is answered, not refused)', r.success === true && r.rowCount > 0, `success=${r.success} rowCount=${r.rowCount}`);
  }

  console.log("\n--- B. City typos (new capability) ---");
  {
    const r = await engine.execute({ question: "show me hospital in Houson Texas" });
    check("B1", '"Houson Texas" (typo, not the already-fixed "Huston") -> 28 rows Houston TX', r.success === true && r.rowCount === 28, `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "Calfornia hospitals" });
    check("B2", '"Calfornia hospitals" (typo) -> 100 rows CA', r.success === true && r.rowCount === 100, `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "Texs hospitals" });
    check("B3", '"Texs hospitals" (typo) -> 100 rows TX', r.success === true && r.rowCount === 100, `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "safest hosptials" });
    check("B4", '"safest hosptials" (typo, no state) -> ranked nationwide by safety_score', r.success === true && r.rowCount === 10, `success=${r.success} rowCount=${r.rowCount}`);
  }

  console.log("\n--- C. Non-regression: already-working phrasings, flag ON ---");
  {
    const r = await engine.execute({ question: "tell me about Mayo Clinic" });
    check("CTRL-C1", '"tell me about Mayo Clinic" -> 1 row full dossier (fast-path, zero LLM cost)', r.success === true && r.rowCount === 1, `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "safest hospitals in Texas" });
    check("CTRL-C2", '"safest hospitals in Texas" (already fixed, Bug F) -> unaffected', r.success === true && r.rowCount === 10, `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "Compare Readmission Rates for Pneumonia in Florida vs Georgia" });
    const rows = (r.rows as Record<string, unknown>[]) ?? [];
    const codes = [...new Set(rows.map((row) => row["measure_code"]))];
    check("CTRL-C3", '"Compare Readmission Rates for Pneumonia in Florida vs Georgia" (Bug D) -> unaffected', r.success === true && r.rowCount === 10 && codes.length === 1 && codes[0] === "READM-30-PN-HRRP", `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "government hospital in Ca" });
    const rows = (r.rows as Record<string, unknown>[]) ?? [];
    check("CTRL-C4", '"government hospital in Ca" (camel-case, Bug L Beyond) -> unaffected', r.success === true && r.rowCount === 10 && rows.every((row) => row["state"] === "CA"), `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "show me hospital in Huston, Texas" });
    check("CTRL-C5", '"Huston, Texas" (already fixed deterministically) -> unaffected, 28 rows', r.success === true && r.rowCount === 28, `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const r = await engine.execute({ question: "ADVENTIST HEALTH HOWARD MEMORIAL vs ADVENTHEALTH CASTLE ROCK" });
    check("CTRL-C6", '"ADVENTIST...vs ADVENTHEALTH CASTLE ROCK" -> 2 rows, unaffected by Layer 0.5', r.success === true && r.rowCount === 2, `success=${r.success} rowCount=${r.rowCount}`);
  }

  console.log("\n--- D. Ambiguity MUST still trigger Phase 8 clarification (spy executor, zero SQL) ---");
  {
    const spy = { callCount: 0 };
    const spyEngine = makeSpyEngine(spy);
    const r = await spyEngine.execute({ question: "compare memorial hospital vs Mayo Clinic" });
    check("D1", '"compare memorial hospital vs Mayo Clinic" -> ambiguous, ZERO SQL calls', r.success === false && r.answerability?.status === "ambiguous" && spy.callCount === 0, `success=${r.success} status=${r.answerability?.status} sqlCalls=${spy.callCount}`);
  }
  {
    const spy = { callCount: 0 };
    const spyEngine = makeSpyEngine(spy);
    const r = await spyEngine.execute({ question: "hospitals in ALBANY county" });
    check("D2", '"hospitals in ALBANY county" (cross-state collision) -> ambiguous, ZERO SQL calls', r.success === false && r.answerability?.status === "ambiguous" && spy.callCount === 0, `success=${r.success} status=${r.answerability?.status} sqlCalls=${spy.callCount}`);
  }

  console.log("\n--- E. Off-topic / adversarial MUST still refuse (spy executor, zero SQL) ---");
  {
    const spy = { callCount: 0 };
    const spyEngine = makeSpyEngine(spy);
    const r = await spyEngine.execute({ question: "what's the weather in Dallas?" });
    check("E1", '"what\'s the weather in Dallas?" -> refused, ZERO SQL calls, no fabrication', r.success === false && spy.callCount === 0, `success=${r.success} sqlCalls=${spy.callCount} error=${(r as any).error}`);
  }
  {
    const spy = { callCount: 0 };
    const spyEngine = makeSpyEngine(spy);
    const r = await spyEngine.execute({ question: "who is the chief of surgery at Johns Hopkins?" });
    check("E2", '"who is the chief of surgery at Johns Hopkins?" -> refused, ZERO SQL calls', r.success === false && spy.callCount === 0, `success=${r.success} sqlCalls=${spy.callCount}`);
  }
  {
    const spy = { callCount: 0 };
    const spyEngine = makeSpyEngine(spy);
    const r = await spyEngine.execute({ question: "what's the weather in Texas?" });
    check("E3", '"what\'s the weather in Texas?" (Bug E control) -> refused, ZERO SQL calls', r.success === false && spy.callCount === 0, `success=${r.success} sqlCalls=${spy.callCount}`);
  }

  console.log("\n--- F. Slot-preservation guard (vague query must NOT invent scope) ---");
  {
    const r = await engine.execute({ question: "heart checkup where should I go" });
    console.log(`    [F1] "heart checkup where should I go" (no state given) -> success=${r.success} rowCount=${r.rowCount}`);
    const rows = (r.rows as Record<string, unknown>[]) ?? [];
    const states = [...new Set(rows.map((row) => row["state"]))];
    // Acceptable outcomes: nationwide (many distinct states) OR an honest
    // clarification asking which state - NOT a silently narrowed single
    // invented state.
    const looksInvented = r.success === true && states.length === 1;
    check("F1", '"heart checkup where should I go" -> nationwide or honest clarification, never a single invented state', !looksInvented, `success=${r.success} states=${JSON.stringify(states)}`);
  }

  // Sections C1 / C3 / D1 / E1 above are the Phase 8 regression set the
  // hardening must not disturb: Mayo 1 row, Florida-vs-Georgia pneumonia
  // 10 rows READM-30-PN-HRRP, memorial-vs-Mayo clarification with 0 SQL,
  // weather refusal with 0 SQL.

  console.log("\n--- G. R1: suggestion dry-runs must not reach the LLM (hidden-call leak) ---");
  // "Emergency Department Visits" is declared rankable but has no
  // "-ranking" template, so this candidate ALWAYS fails - the exact case that
  // used to trigger a 3.8K-token normalizer call from inside a dry-run.
  const unanswerableCandidate = "Show me hospitals with best Emergency Department Visits in Texas";
  for (const flag of ["true", "false"]) {
    process.env.LLM_FIRST_FRONT_DOOR_ENABLED = flag;
    const { counter, fn } = makeCountingFallback();
    const r = await makeRealEngine(fn).execute({ question: unanswerableCandidate, dryRun: true });
    check(`G1-${flag}`, `dry-run of an unanswerable candidate -> 0 LLM-fallback calls (flag=${flag})`, r.success === false && counter.calls === 0, `success=${r.success} llmCalls=${counter.calls}`);
  }
  {
    process.env.LLM_FIRST_FRONT_DOOR_ENABLED = "false";
    const { counter, fn } = makeCountingFallback();
    await makeRealEngine(fn).execute({ question: unanswerableCandidate });
    check("G2", "same question as a REAL request (flag=OFF) -> old Layer 1 still tries the LLM exactly once (the guard is dry-run specific)", counter.calls === 1, `llmCalls=${counter.calls}`);
  }
  {
    // Every candidate the success-path pool can offer must be answerable -
    // a dead chip is what the LLM used to be paid to (fail to) rescue.
    process.env.LLM_FIRST_FRONT_DOOR_ENABLED = "false";
    const capturedPools: string[][] = [];
    (distLlmGateway as any).selectAndRephraseSuggestions = async (pool: string[], _context: unknown, count: number) => {
      capturedPools.push([...pool]);
      return pool.slice(0, count);
    };
    try {
      const { counter, fn } = makeCountingFallback();
      const suggestionEngine = makeRealEngine(fn);
      const seedQuestions = [
        "Show me hospitals with best Safety Performance in Texas",
        "Show me hospitals with lowest Mortality Rate",
        "Show me hospitals with best Patient Experience in Florida",
        "Show me hospitals with lowest Readmission Rate in Ohio",
        "Show me hospitals with best Hospital Overall Rating in California",
      ];
      const chipCounts: number[] = [];
      for (const question of seedQuestions) {
        const r = await suggestionEngine.execute({ question, includeSuggestions: true });
        chipCounts.push(r.suggestions?.length ?? 0);
      }
      const candidates = [...new Set(capturedPools.flat())];
      const dead: string[] = [];
      for (const candidate of candidates) {
        const trial = await suggestionEngine.execute({ question: candidate, dryRun: true });
        if (!trial.success) dead.push(candidate);
      }
      console.log(`    [G3] ${capturedPools.length}/${seedQuestions.length} pools captured, ${candidates.length} distinct candidates, chips per query=${JSON.stringify(chipCounts)}, dead=${JSON.stringify(dead)}`);
      check("G3", "every suggestion-pool candidate passes its dry-run (no dead chips)", capturedPools.length === seedQuestions.length && dead.length === 0, `pools=${capturedPools.length} dead=${JSON.stringify(dead)}`);
      check("G4", "success queries WITH suggestions, flag=OFF -> 0 LLM-fallback calls (was ~40% of queries) and 3 chips each", counter.calls === 0 && chipCounts.every((n) => n === 3), `llmCalls=${counter.calls} chips=${JSON.stringify(chipCounts)}`);
    } finally {
      delete (distLlmGateway as any).selectAndRephraseSuggestions;
      process.env.LLM_FIRST_FRONT_DOOR_ENABLED = "true";
    }
  }

  console.log("\n--- H. State codes in any letter case (deterministic, no LLM) ---");
  {
    const nonColliding: [string, string][] = [["tx", "Texas"], ["az", "Arizona"], ["ak", "Alaska"], ["ca", "California"], ["ny", "New York"]];
    for (const [code, name] of nonColliding) {
      const variants = [code, code[0].toUpperCase() + code[1], code.toUpperCase()];
      const outputs = variants.map((v) => expandUppercaseStateAbbreviations(`Show me hospitals in ${v}`));
      check(`H-${code}`, `"hospitals in ${variants.join(" / ")}" all expand to ${name} before any LLM`, outputs.every((o) => o.includes(name)), JSON.stringify(outputs));
    }
    check("H-OH-upper", '"hospitals in OH" (uppercase, collides with "oh") expands to Ohio deterministically', expandUppercaseStateAbbreviations("Show me hospitals in OH").includes("Ohio"), expandUppercaseStateAbbreviations("Show me hospitals in OH"));
    // Deliberate, documented design (state-abbreviation-preprocessor.ts
    // header): 13 codes are also everyday words ("oh", "in", "or", "me"...),
    // so only the ALL-CAPS form is trusted deterministically. Lowercase "oh"
    // is the normalizer's job (rule 2) - proven end to end in section J.
    check("H-oh-lower", '"hospitals in oh" (lowercase) is NOT expanded deterministically - left to Layer 0.5', expandUppercaseStateAbbreviations("Show me hospitals in oh") === "Show me hospitals in oh", expandUppercaseStateAbbreviations("Show me hospitals in oh"));

    const noLlmEngine = makeRealEngine(null);
    for (const [question, code] of [["show me hospitals in tx", "TX"], ["show me hospitals in Az", "AZ"]] as const) {
      const r = await noLlmEngine.execute({ question });
      const rows = (r.rows as Record<string, unknown>[]) ?? [];
      check(`H-e2e-${code}`, `"${question}" with NO LLM -> success, every row ${code}`, r.success === true && rows.length > 0 && rows.every((row) => row["state"] === code), `success=${r.success} rowCount=${r.rowCount}`);
    }
  }

  console.log("\n--- I. Normalizer prompt size (Groq free tier is 8,000 TOKENS/min) ---");
  {
    const probe = new LLMModelGateway([]);
    let prompt = "";
    // normalizeMessyLanguage runs through the private runJSON(chain, system, ...)
    // (R7: it needs a chain of its own and a trace), not completeJSON().
    (probe as any).runJSON = async (_chain: unknown, system: string) => {
      prompt = system;
      return { status: "fallback" };
    };
    await probe.normalizeMessyLanguage("x", DOMAIN_CAPABILITIES);
    console.log(`    [I1] normalizer system prompt = ${prompt.length} chars (was 15,906)`);
    // Batch 5A-2: 9,000 -> 10,200. The `unsupported` / `closest` contract, the vague-request rule and three format examples
    // add about 1,250 chars (8,795 -> 10,059); still a third under the 15,906 this guard was written against.
    // Batch 5B-1: 10,200 -> 10,350. Registering Stroke and Hospital-Wide Mortality as CONDITIONS and four ownership
    // sub-labels (church-owned, physician-owned, tribal, military) in the compact layout measures 10,337 chars - the
    // 5B audit's own D8 proposal (10,300) was a pre-implementation estimate, 37 chars short of the measured size.
    // Batch 5B-2: 10,350 -> 11,300. 12 new PSI-family CONDITIONS (11 PSIs + Postoperative Sepsis), each shown with
    // only its display name repeated as its one bracketed alias (capability-catalog.ts's COMPACT_PROMPT_CONCEPT_IDS
    // - the full synonym lists live only in aliases/psi.ts and aliases/sepsis.ts, costing no prompt tokens), still
    // measures 11,248 chars: the brief's proposed 10,500 (a +150 estimate) did not anticipate that the universal
    // CONDITIONS renderer (packages/llm-model-gateway, not editable here) always shows the display name a second
    // time in brackets, or that a 12-concept batch is far larger than any prior single batch's CONDITIONS growth.
    // Batch 5B-3: 11,300 -> 11,800. The 9 patient-survey dimensions are named once in RULE 3(e) (not as bracketed
    // CONDITIONS), plus the D4 "communication" clarification with its reason and a "survey star rating" cue: measured
    // 11,747. Without the two cues (11,673) the model mapped "patient survey star ratings" to the wrong dimension (1 in 2
    // live) and skipped the clarification; with them 0/5 wrong dimension and 4/5 clarifications.
    // Batch 5B-4: 11,800 -> 12,200 (the brief cleared up to 13,000-15,000). RULE 3(f) names the 5 hospital types and
    // the 2 flags once, RULE 1 keeps them as slots and RULE 6 no longer reports them: measured 12,077.
    // 2,000 sweep Batch B: 12,200 -> 12,500 (government sub-labels + ownership / type synonyms).
    check("I1", "normalizer prompt <= 12,500 chars (was 15,906 = 3,730 tokens)", prompt.length > 0 && prompt.length <= 12500, `chars=${prompt.length}`);
    check("I2", 'normalizer prompt keeps the city slot and the missing-"in" rule (the frontend-failure fix)', prompt.includes("in <City>, <State>") && prompt.includes('the "in" may be missing'), "city-slot / no-in rule text missing from prompt");
  }

  console.log("\n--- J. Frontend failures: a named city must survive Layer 0.5 (real LLM, flag=ON) ---");
  const cityOf = (row: Record<string, unknown>) => String(row["city"] ?? "").toUpperCase();
  {
    const r = await engine.execute({ question: "show me hospital Houson Texas" });
    const rows = (r.rows as Record<string, unknown>[]) ?? [];
    check("J1", '"show me hospital Houson Texas" (typo AND no "in") -> 28 rows, all HOUSTON TX', r.success === true && r.rowCount === 28 && rows.every((row) => cityOf(row) === "HOUSTON" && row["state"] === "TX"), `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    // Guardrail deviation, on purpose: the brief expected "Houston" ->
    // "Houston, Texas", but Phase 8 forbids inventing scope (docs 06 sec.2) -
    // Houston exists in MO, MS and TX. Correct behavior is either the
    // deterministic "which Houston?" clarification (0 SQL) or an answer
    // scoped to Houston only - never a Texas-wide or nationwide answer.
    const bare = "best hospital for heart pain Houston";
    const spy = { callCount: 0 };
    const spied = await makeSpyEngine(spy).execute({ question: bare });
    if (spied.answerability?.status === "ambiguous") {
      check("J2", '"best hospital for heart pain Houston" -> asks which Houston (candidates incl. Texas), ZERO SQL', spy.callCount === 0 && /tex|TX/i.test(JSON.stringify(spied.answerability)), `sqlCalls=${spy.callCount} answerability=${JSON.stringify(spied.answerability)}`);
    } else {
      const real = await engine.execute({ question: bare });
      const rows = (real.rows as Record<string, unknown>[]) ?? [];
      check("J2", '"best hospital for heart pain Houston" -> answered, every row is HOUSTON (never Texas-wide / nationwide)', real.success === true && rows.length > 0 && rows.every((row) => cityOf(row) === "HOUSTON"), `success=${real.success} rowCount=${real.rowCount}`);
    }
  }
  for (const [id, question] of [["J3", "best hospital for heart pain Houston Texas"], ["J4", "best hospital for heart pain in Houston, Texas"]] as const) {
    const r = await engine.execute({ question });
    const rows = (r.rows as Record<string, unknown>[]) ?? [];
    const codes = [...new Set(rows.map((row) => row["measure_code"]))];
    check(id, `"${question}" -> AMI mortality, every row HOUSTON TX`, r.success === true && rows.length > 0 && rows.every((row) => cityOf(row) === "HOUSTON" && row["state"] === "TX") && codes.length === 1 && codes[0] === "MORT_30_AMI", `success=${r.success} rowCount=${r.rowCount} codes=${JSON.stringify(codes)}`);
  }
  {
    const r = await engine.execute({ question: "show me hospital for heart pain" });
    const rows = (r.rows as Record<string, unknown>[]) ?? [];
    const codes = [...new Set(rows.map((row) => row["measure_code"]))];
    check("J5", '"show me hospital for heart pain" -> 10 nationwide AMI-mortality rows', r.success === true && r.rowCount === 10 && codes.length === 1 && codes[0] === "MORT_30_AMI", `success=${r.success} rowCount=${r.rowCount} codes=${JSON.stringify(codes)}`);
  }
  {
    const r = await engine.execute({ question: "show me hospitals in oh" });
    const rows = (r.rows as Record<string, unknown>[]) ?? [];
    check("J6", '"show me hospitals in oh" (lowercase colliding code) -> Ohio via the LLM rule, every row OH', r.success === true && rows.length > 0 && rows.every((row) => row["state"] === "OH"), `success=${r.success} rowCount=${r.rowCount}`);
  }

  console.log("\n--- L. R7 follow-up: a question the deterministic layers fully understand never reaches the LLM ---");
  {
    // Found via frontend testing: a suggestion chip is proven answerable by a
    // dry-run that skips the LLM, but a CLICK goes through Layer 0.5 - so an
    // LLM could reword a chip that was already fine. The engine now skips
    // Layer 0.5 when every word is already understood (planner.isFullyUnderstood).
    // Includes the real chips the engine generates (LLM-rephrased, with
    // non-breaking hyphens), canonical questions, and aliased phrases.
    const understood = [
      "Which hospitals in Texas have the highest overall rating?",
      "Which non‑profit hospitals have the best safety performance?",
      "Which non‑profit hospitals have the lowest mortality rates?",
      "What are the top hospitals in Texas and California?",
      "Best hospitals in Florida and New York",
      "Show me hospitals with best Safety Performance in Florida",
      "Show me non-profit hospitals with best Patient Experience",
      "Show me hospitals with best Hospital Overall Rating in California",
      "Show me proprietary hospitals with best Hospital List",
      "Show me 5-star hospitals in Texas",
      "Show me hospitals with best Patient Experience in Florida and Georgia",
      "Show me hospitals with lowest Mortality Rate for Acute Myocardial Infarction in Houston, Texas",
      "Best hospitals in Texas",
      "hospitals in Texas",
      "goverment hospital in CA",
      "safest hospitals in Texas",
      "good saftey",
      "heart attack death rate",
      "Compare Readmission Rates for Pneumonia in Florida vs Georgia",
      "hospitals in ALBANY county",
    ];
    const needsTheLlm = [
      "show me hospital Houson Texas",
      "Texs hospitals",
      "Calfornia hospitals",
      "safest hosptials",
      "show me hospital for heart pain",
      "my chest hurts need good hospital",
      "show me hospitals in oh",
      "show me 3 start hospital in texas",
      "what's the weather in Dallas?",
    ];
    const countingFallback = (counter: { calls: number }): FallbackFn => async () => {
      counter.calls++;
      return null;
    };
    const summarize = (r: { success: boolean; rowCount?: number; answerability?: { status: string } }) => JSON.stringify([r.success, r.rowCount, r.answerability?.status]);

    const llmTouched: string[] = [];
    const drifted: string[] = [];
    for (const question of understood) {
      const counter = { calls: 0 };
      const withLlm = await makeSpyEngine({ callCount: 0 }, countingFallback(counter)).execute({ question });
      const withoutLlm = await makeSpyEngine({ callCount: 0 }, null).execute({ question });
      if (counter.calls !== 0) llmTouched.push(`${question} (${counter.calls} calls)`);
      if (summarize(withLlm) !== summarize(withoutLlm)) drifted.push(question);
    }
    check("L1", `${understood.length} fully-understood questions (real chips, canonical, aliased) -> ZERO LLM calls each`, llmTouched.length === 0, JSON.stringify(llmTouched));
    check("L2", "...and the outcome is identical to running with no LLM at all (flag-OFF behavior)", drifted.length === 0, JSON.stringify(drifted));

    const notReaching: string[] = [];
    for (const question of needsTheLlm) {
      const counter = { calls: 0 };
      await makeSpyEngine({ callCount: 0 }, countingFallback(counter)).execute({ question });
      if (counter.calls !== 1) notReaching.push(`${question} (${counter.calls} calls)`);
    }
    check("L3", `${needsTheLlm.length} typo / colloquial / lowercase-state / off-topic questions still reach Layer 0.5 (exactly 1 LLM call each)`, notReaching.length === 0, JSON.stringify(notReaching));
  }

  // Runs LAST: it deliberately makes a failing call that can open the shared
  // per-provider circuit breaker, which would disturb any real-LLM case after it.
  console.log("\n--- K. A tier measured unsafe for rewriting is never asked to rewrite ---");
  {
    const weakTier = FALLBACK_CHAIN.find((tier) => tier.keyId === "groq-allam-2-7b");
    check("K1", "groq-allam-2-7b is flagged unsafeForRewrite (it drops/invents cities and states)", weakTier?.unsafeForRewrite === true, JSON.stringify(weakTier?.unsafeForRewrite));

    const realFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls++;
      throw new Error("network blocked by test");
    }) as typeof fetch;
    try {
      // Circuit breakers are keyed by provider kind and shared module-wide: by
      // now the real "groq" circuit may be open from this run's own rate-limit
      // failures, which would make complete() skip the tier for a reason that
      // has nothing to do with the rewrite exclusion. An OpenAI-kind clone of
      // the same tier config (same flag, same OpenAI-compatible adapter) has
      // its own untouched circuit.
      const probe = new LLMModelGateway([{ ...weakTier!, provider: "openai", apiKey: "test-not-a-real-key" }]);
      const rewrite = await probe.normalizeMessyLanguage("hospitals in oh", DOMAIN_CAPABILITIES);
      const callsForRewrite = fetchCalls;
      await probe.complete("system", "user").catch(() => undefined);
      check("K2", "rewrite role: the flagged tier gets ZERO network calls, result is an honest fallback", callsForRewrite === 0 && rewrite.status === "fallback", `fetchCalls=${callsForRewrite} status=${rewrite.status}`);
      check("K3", "other roles (complete) still use that same tier - the exclusion is role-specific", fetchCalls > callsForRewrite, `fetchCalls=${fetchCalls}`);
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  console.log("\n" + "=".repeat(100));
  console.log(`RESULT: ${pass} passed, ${fail} failed (${pass + fail} total)`);
  console.log(`        of the ${fail} failures, ${quotaFails} coincided with LLM-gateway-unavailable (free-tier rate limit) and ${fail - quotaFails} did not; ${llmUnavailableCalls} LLM call(s) were unavailable`);
  console.log("=".repeat(100));

  if (fail > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
