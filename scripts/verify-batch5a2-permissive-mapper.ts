#!/usr/bin/env tsx

/**
 * Batch 5A-2 (permissive translator prompt, prompt domain purity, intent-aware refusals) verification. No live model
 * call: the model is stubbed (the hook's `normalize` argument, or `globalThis.fetch` for the prompt captures), so
 * everything asserted here is deterministic and free. The engine runs against the live warehouse (read-only SELECTs).
 *
 *   1  gateway purity: no domain word in the gateway's code, and none in any of its prompts for a catalog from another domain
 *   2  the healthcare prompts: the gateway quotes the domain's own words, the output contract, the size budget
 *   3  the vocabulary additions (vague requests, plain lung phrases)
 *   4  the hook: `unsupported` behaves as the old `fallback`; `closest` becomes the one-tap alternates
 *   5  the pure message helpers (what the model dropped, identifiers in a summary, the intent-aware refusal)
 *   6  the engine end to end: a model decline keeps 0 SQL and carries its reading, a rewrite keeps what was dropped
 *
 * Usage: pnpm exec tsx scripts/verify-batch5a2-permissive-mapper.ts
 */
import "dotenv/config";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { DOMAIN_CAPABILITIES } from "../domain-packs/healthcare/src/runtime/capability-catalog";
import { HEALTHCARE_FILLER_WORDS, LAY_GROUPS, correctPlaceCollidingTypos } from "../domain-packs/healthcare/src/runtime/lay-vocabulary";
import { expandUppercaseStateAbbreviations } from "../domain-packs/healthcare/src/runtime/state-abbreviation-preprocessor";
import { AICREDITS_QWEN_FLASH_TIER, LLMModelGateway, type CapabilityCatalog } from "../packages/llm-model-gateway/src/llm-model-gateway";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { SqlExecutor } from "../packages/sql-executor/src/sql-executor";
import { SupabaseDatabaseAdapter } from "../packages/sql-executor/src/supabase-database-adapter";
import { buildInterpretedRefusal, droppedTerms, gateAlternates } from "../supabase/functions/orchestrator/services/graceful-message";
import { mapLayLanguage } from "../supabase/functions/orchestrator/services/lay-mapper";
import { mapNormalizerResult, normalizeQuestion } from "../supabase/functions/orchestrator/services/normalizer-hook";
import { mentionsIdentifier } from "../supabase/functions/orchestrator/services/summary-grounding";
import { env } from "./shared/env";

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

const DOMAIN_WORDS = /hospital|healthcare|health care|mayo|clinic|heart|pneumonia|mortality|readmission|patient|clinical|intelligenceos/i;
const BEST = "Show me best hospitals";
const COPD = "Show me hospitals with lowest Mortality Rate for COPD";
const placeWords = new Set(DOMAIN_CAPABILITIES.states.flatMap((s) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)));
const map = (q: string) => mapLayLanguage(q, DOMAIN_CAPABILITIES.layVocabulary!, { placeWords });

/** A catalog from a domain that is not healthcare, with no prompt wording of its own. */
const WIDGETS: CapabilityCatalog = {
  metrics: [{ displayName: "Widget Output" }, { displayName: "Defect Rate" }],
  states: ["Plant A", "Plant B"],
  ownerships: ["In-house", "Contract"],
  concepts: [{ displayName: "Gadget Line", aliases: ["gadgets"], metrics: ["Defect Rate"] }],
  unsupportedTopics: [],
  exampleAnswerableQuestions: ["Show me plants with best Widget Output"],
  nonAnswerableExamples: ["weather today"],
};

/** Runs `run` with the model call stubbed and returns the system prompt of the request it made. */
async function systemPromptOf(run: (gateway: LLMModelGateway) => Promise<unknown>, reply: string): Promise<string> {
  const realFetch = globalThis.fetch;
  let prompt = "";

  globalThis.fetch = (async (_url: unknown, init: { body?: string }) => {
    const body = JSON.parse(init.body ?? "{}");
    prompt = (body.messages ?? []).find((m: { role: string }) => m.role === "system")?.content ?? "";
    return new Response(JSON.stringify({ choices: [{ message: { content: reply } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const tier = { ...AICREDITS_QWEN_FLASH_TIER, apiKey: "test-key-not-real" };
    await run(new LLMModelGateway([tier], [tier], [tier], [tier]));
  } finally {
    globalThis.fetch = realFetch;
  }

  return prompt;
}

async function main() {
  const wording = DOMAIN_CAPABILITIES.prompts;

  // -------------------------------------------------------------------------------------------- 1. purity
  console.log("\n1 - the gateway names no domain");
  {
    const source = readFileSync(resolve(__dirname, "../packages/llm-model-gateway/src/llm-model-gateway.ts"), "utf-8");
    // comments are history and explanation; the check is on the code and the strings a prompt is made of
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
    const found = [...new Set(code.match(new RegExp(DOMAIN_WORDS.source, "gi")) ?? [])];
    check("no domain word in the gateway's code or strings", found.length === 0, found.join(", "));

    const answer = '{"status":"ok","canonical_question":"x","reason":null}';
    const prompts: Record<string, string> = {
      "rewrite (a foreign catalog)": await systemPromptOf((g) => g.normalizeMessyLanguage("plants with best output", WIDGETS), answer),
      "rewrite (no catalog)": await systemPromptOf((g) => g.normalizeMessyLanguage("plants with best output"), answer),
      "conversational (a foreign catalog)": await systemPromptOf((g) => g.handleConversational("hi", WIDGETS), '{"answer":"a","suggestions":["s"]}'),
      "suggestion phrasing": await systemPromptOf((g) => g.synthesizeSuggestions({ question: "q", candidates: ["a", "b"] }), '["a","b"]'),
      "suggestion selector": await systemPromptOf((g) => g.selectAndRephraseSuggestions(["a", "b", "c", "d"], {}, 3), '["a","b","c"]'),
      summary: await systemPromptOf((g) => g.summarizeResult("q", [{ a: 1 }]), "ok"),
    };
    for (const [role, prompt] of Object.entries(prompts)) {
      check(`the ${role} prompt is built, and has no domain word`, prompt.length > 0 && !DOMAIN_WORDS.test(prompt), (prompt.match(DOMAIN_WORDS) ?? [])[0] ?? "empty prompt");
    }
    check("a foreign catalog's own metric names reach the rewrite prompt", prompts["rewrite (a foreign catalog)"]!.includes("Widget Output") && prompts["rewrite (a foreign catalog)"]!.includes("Gadget Line"));
  }

  // -------------------------------------------------------------------------------------------- 2. healthcare prompts
  console.log("\n2 - the healthcare prompts: the domain's words, the contract, the budget");
  {
    const answer = '{"status":"ok","canonical_question":"x","reason":null}';
    const prompt = await systemPromptOf((g) => g.normalizeMessyLanguage("hospitals in tx", DOMAIN_CAPABILITIES), answer);
    const rules = wording?.normalizer?.rules ?? [];
    const examples = wording?.normalizer?.examples ?? [];
    check("the domain supplies the rewrite rules and examples", rules.length > 10 && examples.length > 8);
    check("every rule line the domain wrote is in the prompt", rules.filter(Boolean).every((line) => prompt.includes(line)));
    check("every example line the domain wrote is in the prompt", examples.every((line) => prompt.includes(line)));
    check("the subject comes from the domain", prompt.startsWith(`You rewrite ONE user question about ${wording?.normalizer?.subject} into`));
    check('the output contract offers "unsupported" and "closest", not "fallback"', /"ok" \| "need_clarification" \| "unsupported"/.test(prompt) && /"closest": string\[\]/.test(prompt) && !/status "fallback"/.test(prompt));
    check("RULE 5 tells the model what to put in interpretation and closest for an unsupported ask", /interpretation = what they want, in their own few words/.test(prompt) && /closest = up to 3 canonical questions/.test(prompt));
    check("a request that names no measure is answered, not refused or asked", /names no measure, condition or symptom/.test(prompt) && /Show me best hospitals/.test(prompt));
    check("a comparison with no hospital named is asked about, not refused", /A comparison with no hospital named/.test(prompt) && /need_clarification, reason/.test(prompt));
    check("for a condition, safest / best / strong / top all mean its lowest Mortality Rate (stated positively: naming the wrong metric primes a small model to write it)", prompt.includes('For a condition, "safest", "best", "strong" and "top" all mean its lowest Mortality Rate.'), "rule text missing");
    // Batch 5B-1: 10,200 -> 10,350; Batch 5B-2: 10,350 -> 11,300 (see the matching I1 guard in
    // verify-llm-first-front-door.ts for the measurement and why the brief's own 10,500 estimate fell short).
    // Batch 5B-3: 11,300 -> 11,800 (same measurement as I1). Batch 5B-4: 11,800 -> 12,200 (hospital types and flags).
    // 2,000 sweep Batch B: 12,200 -> 12,500 (the three government sub-labels as their own ownership words, and the ownership / type synonyms).
    check("the rewrite prompt stays within its size budget (12,500 chars)", prompt.length <= 12500, `chars=${prompt.length}`);
    console.log(`    [size] rewrite prompt = ${prompt.length} chars (5A-1: 8,795; before the 5A audit: 15,906)`);

    const summary = await systemPromptOf((g) => g.summarizeResult("q", [{ a: 1 }], undefined, wording), "ok");
    check("the summary prompt forbids column names and codes", /Never write a column name or a code/.test(summary));
    const conversational = await systemPromptOf((g) => g.handleConversational("hi", DOMAIN_CAPABILITIES), '{"answer":"a","suggestions":["s"]}');
    check("the conversational prompt still names the platform (from the domain)", /IntelligenceOS, a healthcare analytics platform/.test(conversational));
  }

  // -------------------------------------------------------------------------------------------- 3. vocabulary
  console.log("\n3 - the vocabulary additions");
  {
    for (const q of ["which hospital should I go to", "help me find a hospital", "find me a hospital", "where should I go", "what hospitals do you have"]) {
      const m = map(q).mapped;
      check(`"${q}" -> ${BEST} with the no-measure note`, m?.canonicalQuestion === BEST && /You didn't name a measure/.test(m.interpretation ?? ""), JSON.stringify(m));
    }
    check('"which hospital should I go to in Ohio" keeps the place', map("which hospital should I go to in Ohio").mapped?.canonicalQuestion === `${BEST} in Ohio`, JSON.stringify(map("which hospital should I go to in Ohio").mapped));
    for (const q of ["my lungs are acting up, which hospital should I trust in Arizona", "lungs acting up in Arizona"]) {
      check(`"${q}" -> COPD mortality in Arizona`, map(q).mapped?.canonicalQuestion === `${COPD} in Arizona`, JSON.stringify(map(q).mapped));
    }
    check('"bad lungs" is a plain lung phrase', map("bad lungs").mapped?.canonicalQuestion === COPD);
    check("the vague-request examples the prompt gives are vocabulary phrases of the quality group", ["good hospital", "which hospital should i go to"].every((p) => LAY_GROUPS.find((g) => g.id === "quality")?.phrases.includes(p)));
    check("a metric word still switches the mapping off", map("which hospital should I go to for the lowest mortality").mapped === undefined);
  }

  // -------------------------------------------------------------------------------------------- 4. hook
  console.log("\n4 - the hook: `unsupported`, `closest`");
  {
    // 2,000 sweep (Batch E): "parking" is a listed topic now (capability-catalog.ts); "free wifi" is still unlisted.
    const unlisted = mapNormalizerResult({ status: "unsupported", canonical_question: null, unsupported_terms: ["free wifi"], interpretation: "free wifi", closest: ["Show me best hospitals", "  Show me best hospitals in Texas  ", "", "x".repeat(300), "a fourth"] }, DOMAIN_CAPABILITIES);
    check("an unsupported ask the domain does not list is not binding: no rewrite, the reading rides in the meta", unlisted !== null && !("canonicalQuestion" in unlisted) && !("unsupportedTerms" in unlisted) && !("clarification" in unlisted));
    const meta = (unlisted as any)?.meta ?? {};
    check("the reading is recorded", meta.interpretation === "free wifi" && meta.unsupported_terms === "free wifi", JSON.stringify(meta));
    check("closest becomes at most 3 alternates, trimmed, one per line, empty and over-long entries dropped", meta.alternates === "Show me best hospitals\nShow me best hospitals in Texas\na fourth", JSON.stringify(meta.alternates));
    // Batch 5B-1: "stroke" is a registered topic now (concepts/stroke.ts). Batch 5B-2: "sepsis" is too
    // (concepts/sepsis.ts); "hospital acquired infections" still has no measure.
    const listed = mapNormalizerResult({ status: "unsupported", canonical_question: null, unsupported_terms: ["hospital acquired infections"] }, DOMAIN_CAPABILITIES) as any;
    check("an unsupported ask that names a listed topic is still a binding refusal", Array.isArray(listed?.unsupportedTerms) && listed.unsupportedTerms[0] === "hospital acquired infections", JSON.stringify(listed));
    check("markup in the model's reading is never passed on", ((mapNormalizerResult({ status: "unsupported", interpretation: "**free** wifi" }, DOMAIN_CAPABILITIES) as any)?.meta ?? {}).interpretation === undefined);
    const ok = mapNormalizerResult({ status: "ok", canonical_question: "Show me hospitals in Florida", unsupported_terms: ["mental health"], closest: [] }, DOMAIN_CAPABILITIES) as any;
    check("an ok rewrite is unchanged by the new fields", ok?.canonicalQuestion === "Show me hospitals in Florida" && ok.meta?.unsupported_terms === "mental health" && ok.meta?.alternates === undefined, JSON.stringify(ok));
    const old = mapNormalizerResult({ status: "fallback", canonical_question: null }, DOMAIN_CAPABILITIES);
    check('the old "fallback" status behaves as before (no rewrite, nothing to say)', old === null, JSON.stringify(old));

    // a canonical question the pipeline cannot rank ("best Safety Performance for Pneumonia") is repaired, with the note
    const rewriteAs = (canonical: string) => normalizeQuestion("q", DOMAIN_CAPABILITIES, async () => ({ status: "ok", canonical_question: canonical, interpretation: "Read 'strong' as best Safety Performance" })) as Promise<any>;
    const fixed = await rewriteAs("Show me hospitals with best Safety Performance for Pneumonia in Dallas, Texas");
    check("a whole-hospital metric written 'for' a condition becomes that condition's lowest mortality, place kept", fixed?.canonicalQuestion === "Show me hospitals with lowest Mortality Rate for Pneumonia in Dallas, Texas", JSON.stringify(fixed));
    check("the model's own reading is replaced by the plain note, and what the model wrote is kept in the trace", /^Showing the condition's mortality rate: safety and patient experience are scored for a whole hospital/.test(fixed?.meta?.interpretation ?? "") && fixed?.meta?.repaired === "Show me hospitals with best Safety Performance for Pneumonia in Dallas, Texas", JSON.stringify(fixed?.meta));
    check("every whole-hospital metric, and worst reads as highest", (await rewriteAs("Show me hospitals with top Patient Experience for CABG"))?.canonicalQuestion === "Show me hospitals with lowest Mortality Rate for CABG" && (await rewriteAs("Show me non-profit hospitals with worst Hospital Overall Rating for Heart Failure in Ohio"))?.canonicalQuestion === "Show me non-profit hospitals with highest Mortality Rate for Heart Failure in Ohio");
    for (const untouched of ["Show me hospitals with best Safety Performance in Michigan", "Show me non-profit hospitals with best Safety Performance", "Show me hospitals with lowest Mortality Rate for Pneumonia", "Show me hospitals in Texas"]) {
      const same = await rewriteAs(untouched);
      check(`not repaired: "${untouched}"`, same?.canonicalQuestion === untouched && same?.meta?.repaired === undefined, JSON.stringify(same));
    }
    check("a layperson mapping is never repaired", (await normalizeQuestion("chest pain", DOMAIN_CAPABILITIES, async () => ({ status: "fallback" })) as any)?.meta?.repaired === undefined);
  }

  // -------------------------------------------------------------------------------------------- 5. message helpers
  console.log("\n5 - the message helpers");
  {
    check("a term the rewrite dropped is reported", droppedTerms(["mental health"], undefined, "Show me hospitals in Florida").join() === "mental health");
    check("a term the model already explained is not reported twice", droppedTerms(["diabetes care"], "Read 'diabetes care' as a general request for hospitals", "Show me hospitals in Arizona").length === 0);
    check("a term still in the canonical question is not reported", droppedTerms(["Texas"], undefined, "Show me best hospitals in Texas").length === 0);
    check("terms are matched as whole words", droppedTerms(["care"], undefined, "Show me hospitals with best Patient Experience in a careful state").join() === "care");
    check("an empty term is ignored", droppedTerms(["", "  "], undefined, undefined).length === 0);

    for (const text of ["The avg_patient_satisfaction is 97.5", "MORT_30_AMI leads", "facility_id 100151 is first"]) {
      check(`a column name or code is caught: "${text}"`, mentionsIdentifier(text));
    }
    for (const text of ["Unity Medical Center in Manchester, TN has an average patient satisfaction of 97.5.", "St. Mary's Hospital in Castle Rock, CO. Other facilities follow.", "The top hospital is Mayo Clinic - Rochester."]) {
      check(`a plain sentence is not caught: "${text.slice(0, 40)}..."`, !mentionsIdentifier(text));
    }

    const generic = new Set(["Unable to resolve question.", "Unable to create query plan."]);
    const asked = "hospitals with free wifi";
    const gate = { status: "unavailable", detail: { unsupported_terms: "free wifi", interpretation: "a helipad", alternates: "Show me best hospitals\nShow me best hospitals in Texas" } };
    const message = buildInterpretedRefusal(gate, "Unable to resolve question.", generic, DOMAIN_CAPABILITIES.coverageSummary, asked);
    check("the refusal echoes the user's own words and says what is tracked", /^I understand you're looking for "free wifi", but I don't have that\. I currently track heart attack/.test(message ?? "") && /Try one of the questions below\.$/.test(message ?? ""), String(message));
    check("a reading copied from a prompt example is never quoted back (\"a helipad\" for \"free wifi\")", !/helipad/.test(message ?? ""));
    check("a reading that is not in what the user typed, with no term to fall back on, gives the generic card", buildInterpretedRefusal({ status: "unavailable", detail: { interpretation: "a helipad" } }, "Unable to resolve question.", generic, "x", asked) === undefined);
    check("a reading built only from the user's own words is echoed", /^I understand you're looking for "a cardiologist", but/.test(buildInterpretedRefusal({ status: "unavailable", detail: { interpretation: "a cardiologist" } }, "Unable to create query plan.", generic, "x", "cardiologist in Boston") ?? ""));
    check("an off-topic ask is not echoed back as if it were a topic (the model reported the whole question as the term)", buildInterpretedRefusal({ status: "unavailable", detail: { unsupported_terms: "who won the game last night" } }, "Unable to resolve question.", generic, "x", "who won the game last night") === undefined && buildInterpretedRefusal({ status: "unavailable", detail: { unsupported_terms: "the weather in Dallas" } }, "Unable to create query plan.", generic, "x", "what is the weather in Dallas") === undefined);
    check("a term that is a small part of the question still is", /"beds"/.test(buildInterpretedRefusal({ status: "unavailable", detail: { unsupported_terms: "beds" } }, "Unable to resolve question.", generic, "x", "how many beds does Cleveland Clinic have") ?? "") && /"accept Medicare"/.test(buildInterpretedRefusal({ status: "unavailable", detail: { unsupported_terms: "accept Medicare" } }, "Unable to resolve question.", generic, "x", "hospitals that accept Medicare") ?? ""));
    check("a term the user did not type is not echoed", buildInterpretedRefusal({ status: "unavailable", detail: { unsupported_terms: "helipad" } }, "Unable to resolve question.", generic, "x", asked) === undefined);
    check("only the generic dead end is replaced (a clarification is left alone)", buildInterpretedRefusal(gate, "Which state or city should I look in?", generic, "x", asked) === undefined);
    check("a provider failure has no reading to echo", buildInterpretedRefusal({ status: "unavailable", detail: { reason: "LLM gateway unavailable" } }, "Unable to resolve question.", generic, "x", asked) === undefined);
    check("a binding decline is handled by its own message, not this one", buildInterpretedRefusal({ status: "unsupported", detail: { interpretation: "stroke" } }, "Unable to resolve question.", generic, "x", "stroke") === undefined);
    check("dropped terms are only ever the user's own words", droppedTerms(["mental health", "psychiatry"], undefined, "Show me hospitals in Florida", "mental health hospitals in Florida").join() === "mental health");
    check("the alternates come back as a list", gateAlternates(gate).length === 2 && gateAlternates(undefined).length === 0 && gateAlternates({ status: "x" }).length === 0);
  }

  // -------------------------------------------------------------------------------------------- 6. engine
  console.log("\n6 - the engine end to end (front door wired, model stubbed)");
  {
    process.env.LLM_FIRST_FRONT_DOOR_ENABLED = "true";
    const runtime = createDomainRuntime(healthcareDomain);
    const sqlExecutor = new SqlExecutor(new SupabaseDatabaseAdapter(createClient(env.supabaseUrl, env.supabaseServiceRoleKey)));
    const replies: Record<string, any> = {
      "hospitals with free wifi": { status: "unsupported", canonical_question: null, unsupported_terms: ["free wifi"], interpretation: "free wifi", filler_dropped: [], closest: ["Show me best hospitals", "Show me best hospitals in Texas", "Show me hospitals with best Unicorn Score"] },
      // Batch 5B-1: "stroke" is a registered topic now. Batch 5B-2: "sepsis" is too; "hospital acquired infections"
      // still has no measure, so it still exercises this path.
      "hospitals that treat hospital acquired infections": { status: "unsupported", canonical_question: null, unsupported_terms: ["hospital acquired infections"], interpretation: "hospital acquired infections", closest: ["Show me best hospitals"] },
      "mental health hospitals in Florida": { status: "ok", canonical_question: "Show me hospitals in Florida", unsupported_terms: ["mental health"], interpretation: null, filler_dropped: [] },
      "what is the weather in Dallas": { status: "unsupported", canonical_question: null, interpretation: null, closest: [], unsupported_terms: [] },
      "hospital that treats pneumonia well near Dallas Texas": { status: "ok", canonical_question: "Show me hospitals with best Safety Performance for Pneumonia in Dallas, Texas", interpretation: "Read 'treats pneumonia well' as best Safety Performance for Pneumonia" },
      "compare hospitals": { status: "unsupported", canonical_question: null, unsupported_terms: ["compare"], interpretation: "a comparison of hospitals", closest: ["Show me best hospitals"] },
      hospital: { status: "need_clarification", canonical_question: null, reason: "Which metric or condition would you like to analyze for hospitals?" },
    };
    const engine = createRuntimeEngine({
      runtime,
      semantic: createSemanticResolver(runtime.registry, runtime.entityProvider),
      planner: new QueryPlanner({ fillerWords: HEALTHCARE_FILLER_WORDS }),
      executionPlanMapper: new ExecutionPlanMapper(),
      executor: sqlExecutor,
      preprocessQuestion: (question: string) => expandUppercaseStateAbbreviations(correctPlaceCollidingTypos(question)),
      llmFallback: ((question: string) => normalizeQuestion(question, DOMAIN_CAPABILITIES, async () => replies[question] ?? { status: "unsupported" })) as any,
    });
    const realLog = console.log;
    const run = async (question: string, extra: Record<string, unknown> = {}): Promise<any> => {
      console.log = () => {};
      try {
        return await engine.execute({ question, ...extra });
      } finally {
        console.log = realLog;
      }
    };
    const sqlCalls = (r: any) => (r.trace ?? []).reduce((sum: number, g: any) => sum + (g.sqlCalls ?? 0), 0);
    const gateOf = (r: any) => [...(r.trace ?? [])].reverse().find((g: any) => g.phase === "llm-normalization");

    const parking = await run("hospitals with free wifi");
    const pg = gateOf(parking);
    check("a model decline that no catalog topic covers ends in a refusal with 0 SQL (Phase 8)", parking.success === false && sqlCalls(parking) === 0, `success=${parking.success} sql=${sqlCalls(parking)}`);
    check("the trace carries the reading, the terms and the alternates", pg?.status === "unavailable" && pg.detail?.interpretation === "free wifi" && pg.detail?.unsupported_terms === "free wifi" && gateAlternates(pg).length === 3, JSON.stringify(pg));
    const shown: string[] = [];
    for (const candidate of gateAlternates(pg)) {
      if ((await run(candidate, { dryRun: true })).success) shown.push(candidate);
    }
    check("the alternates are dry-run like every chip: the two answerable ones stay, the invented one goes", shown.join("|") === "Show me best hospitals|Show me best hospitals in Texas", shown.join("|"));
    check("the refusal is the generic dead end the intent-aware reply replaces", parking.error === "Unable to resolve question." || parking.error === "Unable to create query plan.", String(parking.error));

    const haiRun = await run("hospitals that treat hospital acquired infections");
    check("an unsupported ask that names a listed topic is refused with 0 SQL, whichever status word the model used", haiRun.success === false && sqlCalls(haiRun) === 0 && gateOf(haiRun)?.status === "unsupported", JSON.stringify(gateOf(haiRun)));

    const mental = await run("mental health hospitals in Florida");
    const mg = gateOf(mental);
    check("a rewrite that dropped an unsupported term is still answered", mental.success === true && mg?.status === "rewritten", `success=${mental.success} gate=${mg?.status}`);
    check("what it dropped is on the trace, ready for the note", droppedTerms(String(mg?.detail?.unsupported_terms ?? "").split("; "), mg?.detail?.interpretation as any, mg?.detail?.canonicalQuestion as any).join() === "mental health", JSON.stringify(mg?.detail));

    const weather = await run("what is the weather in Dallas");
    check("an off-topic ask has no reading to echo and refuses with 0 SQL", weather.success === false && sqlCalls(weather) === 0 && !gateOf(weather)?.detail?.interpretation, JSON.stringify(gateOf(weather)));

    const treated = await run("hospital that treats pneumonia well near Dallas Texas");
    const tg = gateOf(treated);
    check("the repaired rewrite is answered (it was a refusal before the repair) and the trace shows both questions", treated.success === true && treated.rowCount > 0 && tg?.status === "rewritten" && /lowest Mortality Rate for Pneumonia in Dallas/.test(String(tg.detail?.canonicalQuestion)) && /Safety Performance for Pneumonia/.test(String(tg.detail?.repaired)), JSON.stringify(tg?.detail));
    const typed = await run("Show me hospitals with best Safety Performance for Pneumonia in Dallas, Texas");
    check("the same words typed by the user are NOT repaired (they are refused as before, 0 SQL)", typed.success === false && sqlCalls(typed) === 0, `success=${typed.success}`);

    // the on-failure path (the planner understood the words, the pipeline still failed): the front door's answer is recorded there too
    const compare = await run("compare hospitals");
    const cg = gateOf(compare);
    check("on the on-failure path a model decline is now on the trace, with its reading and alternates", compare.success === false && sqlCalls(compare) === 0 && cg?.status === "unavailable" && cg.detail?.interpretation === "a comparison of hospitals" && gateAlternates(cg).join() === "Show me best hospitals", JSON.stringify(cg));
    const bare = await run("hospital");
    const bg = gateOf(bare);
    check("on the on-failure path a model clarification still reaches the user unchanged, and is on the trace", bare.success === false && bare.error === "Which metric or condition would you like to analyze for hospitals?" && bg?.status === "clarification", `${bare.error} | ${bg?.status}`);
    check("and neither executes SQL (Phase 8: ambiguous / unsupported => 0 SQL)", sqlCalls(bare) === 0 && sqlCalls(compare) === 0);
  }

  console.log("\n" + "=".repeat(60));
  console.log(`RESULT: ${passed} passed, ${failed} failed (${passed + failed} total)`);
  console.log("=".repeat(60));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
