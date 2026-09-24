#!/usr/bin/env tsx

/**
 * Batch 5A-1 (deterministic foundation) verification. No model is called: the LLM front door is wired but the stub
 * always answers `fallback`, so everything asserted here is deterministic and free. The engine runs against the live
 * warehouse (read-only SELECTs). Every refusal asserts SQL = 0 (Phase 8: ambiguous / unsupported => no SQL).
 *
 *   1  the pre-check: layperson words no longer refuse; the genuinely unanswerable topics still do
 *   2  the layperson mapper (pure): canonical question, note, filler, alternates, and every case it must NOT rewrite
 *   3  the hook: a mapped phrase never reaches the model; misspelt unsupported topics are refused as what they are
 *   4  the engine end to end: the mapped questions answer, every alternate and every scope-guidance chip is answerable
 *   5  the query planner reads the domain's filler words as data
 *   6  the scoped unaccounted-word guard
 *   7  the graceful messages
 *
 * Usage: pnpm exec tsx scripts/verify-batch5a1-vocab.ts
 */
import "dotenv/config";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { DOMAIN_CAPABILITIES } from "../domain-packs/healthcare/src/runtime/capability-catalog";
import { HEALTHCARE_FILLER_WORDS, LAY_GROUPS, PROMPT_CONDITIONS, PROMPT_JOINT_PHRASES, SCOPE_GUIDANCE, correctPlaceCollidingTypos, scopeGuidanceChips } from "../domain-packs/healthcare/src/runtime/lay-vocabulary";
import { OVERALL_RATING_TIE_COUNT_TEMPLATE, describeOverallRatingTies, formatTieNote } from "../domain-packs/healthcare/src/runtime/ranking-ties";
import { buildIgnoredNote, buildScopeMessage, buildUnaccountedMessage, composeSummary } from "../supabase/functions/orchestrator/services/graceful-message";
import { findUngroundedNames } from "../supabase/functions/orchestrator/services/summary-grounding";
import { expandUppercaseStateAbbreviations } from "../domain-packs/healthcare/src/runtime/state-abbreviation-preprocessor";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { SqlExecutor } from "../packages/sql-executor/src/sql-executor";
import { SupabaseDatabaseAdapter } from "../packages/sql-executor/src/supabase-database-adapter";
import { mapLayLanguage } from "../supabase/functions/orchestrator/services/lay-mapper";
import { normalizeQuestion, precheckUnsupported } from "../supabase/functions/orchestrator/services/normalizer-hook";
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

const AMI = "Show me hospitals with lowest Mortality Rate for Acute Myocardial Infarction";
const HF = "Show me hospitals with lowest Mortality Rate for Heart Failure";
const CABG = "Show me hospitals with lowest Mortality Rate for CABG";
const COPD = "Show me hospitals with lowest Mortality Rate for COPD";
const PN = "Show me hospitals with lowest Mortality Rate for Pneumonia";
const HIP_KNEE = "Show me hospitals with lowest hip and knee replacement complication rate";
const BEST = "Show me best hospitals";
const STROKE = "Show me hospitals with lowest Mortality Rate for Stroke"; // Batch 5B-1

const placeWords = new Set(DOMAIN_CAPABILITIES.states.flatMap((s) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)));
const map = (q: string) => mapLayLanguage(q, DOMAIN_CAPABILITIES.layVocabulary!, { placeWords });

async function main() {
  // -------------------------------------------------------------------------------------------- 1. pre-check
  console.log("\n1 - the pre-check refuses only what the platform cannot answer");
  const ANSWERABLE_SENTENCES = [
    "Can you recommend a good hospital for my mother?",
    "I would recommend a hospital near Dallas",
    "Which hospital would you recommend for heart care in Ohio?",
    "best hospital for a routine checkup",
    "I have a heart problem, where should I go in Texas?",
    "my dad has trouble breathing, best hospital in Ohio",
    "hospital for a lung infection in Florida",
    "is there a hospital for heart surgery in California",
    "recommend a hospital",
    "what should I do about a heart problem",
    "hospitals with a quiet environment",
    "sleep quality at hospitals",
    "hospital courtesy and respect",
  ];
  for (const sentence of ANSWERABLE_SENTENCES) {
    check(`not refused by the pre-check: "${sentence}"`, precheckUnsupported(sentence, DOMAIN_CAPABILITIES).length === 0, JSON.stringify(precheckUnsupported(sentence, DOMAIN_CAPABILITIES)));
  }
  for (const phrase of ["checkup", "heart problem", "trouble breathing", "breathing problems", "lung infection", "heart surgery", "recommend", "would recommend", "quiet", "sleep", "communication", "courtesy"]) {
    check(`"${phrase}" is no longer an unsupported topic`, !DOMAIN_CAPABILITIES.unsupportedTopics.includes(phrase));
  }
  const STILL_REFUSED: [string, string][] = [
    // Batch 5B-1: stroke, hospital-wide mortality and the ownership sub-labels (military, church-owned, department
    // of defense, physician-owned, tribal) are registered now - their own readmission/complication wording, which
    // the warehouse has no measure for, replaces them here.
    ["stroke readmission", "stroke readmission"], ["ER wait times", "wait times"],
    ["hospital wide readmission", "hospital wide readmission"], ["decile", "decile"],
    // Batch 5B-5: DC is a registered jurisdiction now; a region takes its place.
    ["hospitals in the bay area", "bay area"], ["write me a poem about hospitals", "poem"],
    ["which hospitals are best since 2020", "since"], ["emergency department", "emergency department"],
    // Batch 5B-3: "sanitary"/"cleanest" are survey wording now; the survey details with no data replace them.
    ["staff responsiveness scores", "staff responsiveness"], ["care transition", "care transition"],
    // Batch 5B-4: "emergency services", "birthing friendly" and "hospital type" are registered hospital types / flags now.
    ["ER waits", "er waits"], ["ED waits in Texas", "ed waits"], ["hospital volumes", "volumes"], ["hospital prices in Texas", "prices"],
    ["best doctors in Ohio", "doctors"], ["time trends of ratings", "time trends"], ["nurses listen carefully", "listen carefully"],
    ["how much does an MRI cost", "how much does"],
    // Batch 5B-2: bare "sepsis hospitals" is registered now (the new sepsis-rate lay group); its mortality/survival/
    // recovery wording, which the warehouse has no measure for, replaces it here.
    ["sepsis mortality hospitals", "sepsis mortality"], ["hospital acquired infections", "hospital acquired infections"],
  ];
  const NOW_SUPPORTED = [
    "stroke hospitals", "military hospitals", "church owned hospitals", "department of defense hospitals", "hospital wide mortality",
    // Batch 5B-2
    "sepsis hospitals", "postoperative sepsis rate", "pressure ulcer rate", "in-hospital falls with fracture",
    "postoperative kidney injury requiring dialysis", "blood clots after surgery", "patient safety indicators", "PSI 90 composite",
  ];
  for (const question of NOW_SUPPORTED) {
    check(`Batch 5B-1: "${question}" is no longer refused`, precheckUnsupported(question, DOMAIN_CAPABILITIES).length === 0, JSON.stringify(precheckUnsupported(question, DOMAIN_CAPABILITIES)));
  }
  for (const [question, topic] of STILL_REFUSED) {
    check(`still refused: "${question}" (${topic})`, precheckUnsupported(question, DOMAIN_CAPABILITIES).includes(topic), JSON.stringify(precheckUnsupported(question, DOMAIN_CAPABILITIES)));
  }

  // -------------------------------------------------------------------------------------------- 2. mapper
  console.log("\n2 - the layperson mapper");
  type Case = { q: string; canon: string; note?: RegExp; filler?: string[]; alternates?: number };
  const CASES: Case[] = [
    { q: "penumonia checkup", canon: PN, note: /^Showing Pneumonia Mortality for 'penumonia checkup'\. You can also view Pneumonia Readmissions below\.$/, filler: ["checkup"], alternates: 1 },
    { q: "pnemonia checkup in Ohio", canon: `${PN} in Ohio`, filler: ["checkup"] },
    { q: "pneunomia", canon: PN },
    { q: "pneumonia screening", canon: PN, filler: ["screening"] },
    { q: "pneumonia test", canon: PN, filler: ["test"] },
    { q: "I need hospital for pneumonia checkup", canon: PN, filler: ["checkup"] },
    { q: "Show me hospital for penumonia checkup in Texas", canon: `${PN} in Texas`, note: /'penumonia checkup'/ },
    { q: "heart problem Texas", canon: `${AMI} Texas`, note: /^Showing Heart Attack Mortality for 'heart problem'\. You can also view Heart Failure or Bypass Surgery below\.$/, alternates: 2 },
    { q: "Can you show me best hospital for heart problem in Texas?", canon: `${AMI} in Texas` },
    { q: "Best hospital for heart issue in California", canon: `${AMI} in California`, filler: ["issue"] },
    { q: "hospital for heart issue", canon: AMI },
    { q: "heart trouble in Florida", canon: `${AMI} in Florida` },
    { q: "hospital for heart", canon: AMI },
    { q: "Hey show me hospital for heart", canon: AMI },
    { q: "hart problem", canon: AMI, note: /'hart problem'/ },
    { q: "hert attak", canon: AMI, note: /'hert attak'/ },
    { q: "heart failur", canon: HF },
    { q: "hospital for heart failure in Texas", canon: `${HF} in Texas` },
    { q: "chest pain", canon: AMI, note: /^Showing Heart Attack Mortality for 'chest pain'\.$/, alternates: 0 },
    { q: "Please show me good hospital for chest pain", canon: AMI },
    { q: "trouble breathing", canon: COPD, note: /^Showing COPD Mortality for 'trouble breathing'\. You can also view Pneumonia or COPD Readmissions below\.$/, alternates: 2 },
    { q: "breathing problem", canon: COPD },
    { q: "shortness of breath", canon: COPD },
    { q: "hospital for breathing", canon: COPD },
    { q: "What is best hospital for breathing problem?", canon: COPD },
    { q: "I get out of breath easily, which hospital in Arizona?", canon: `${COPD} in Arizona`, filler: ["get", "easily"] },
    { q: "my dad has trouble breathing, best hospital in Ohio", canon: `${COPD} in Ohio` },
    { q: "chest infection hospital in Georgia", canon: `${PN} in Georgia` },
    { q: "hospital for a lung infection in Florida", canon: `${PN} in Florida` },
    { q: "is there a hospital for heart surgery in California", canon: `${CABG} in California`, note: /heart-surgery measure I track/ },
    { q: "best hospital for bypass checkup", canon: CABG, filler: ["checkup"] },
    { q: "hip problem best hospital in Ohio", canon: `${HIP_KNEE} in Ohio`, alternates: 1 },
    { q: "good hospital", canon: BEST, note: /highest overall-rated hospitals for 'good hospital'/ },
    { q: "which hospital is good", canon: BEST },
    { q: "show me some hospitals", canon: BEST },
    { q: "recommend a good hospital in Texas", canon: `${BEST} in Texas`, filler: ["recommend"] },
    { q: "hospitals near me", canon: BEST, note: /can't see your location/ },
    { q: "good hospital near me", canon: BEST, note: /can't see your location/ },
    { q: "goverment owned", canon: "Show me government hospitals" },
    { q: "government hospitals for heart problem in Texas", canon: `${AMI} government in Texas` },
    { q: "heart problem in Houston, Texas", canon: `${AMI} in Houston Texas` },
  ];
  for (const c of CASES) {
    const r = map(c.q);
    const m = r.mapped;
    check(
      `"${c.q}" -> ${c.canon}`,
      m?.canonicalQuestion === c.canon &&
        (c.note === undefined || (m?.interpretation !== undefined && c.note.test(m.interpretation))) &&
        (c.filler === undefined || JSON.stringify(m?.fillerDropped) === JSON.stringify(c.filler)) &&
        (c.alternates === undefined || m?.alternates.length === c.alternates),
      JSON.stringify(m),
    );
  }
  check("a plain synonym carries no note (\"goverment owned\")", map("goverment owned").mapped?.interpretation === undefined);

  // what it must NOT rewrite: the model / pipeline decide
  const UNMAPPED = [
    "worst hospital for heart problem", "top 5 hospitals for heart problem", "heart problem and breathing problem", "pneumonia readmissions in Texas",
    "pneumonia complicatons", "hospitals in Hart County", "which hospital is safest for my dad knee replacement in Georgia", "heart problem houston",
    // Batch 5B-1: "stroke hospitals" is mapped now (the new stroke group below); "stroke readmissions" (a blocker
    // word) takes its place as a phrase this mapper must still leave to the pipeline / model.
    "Show me hospitals with lowest Mortality Rate for Pneumonia", "hospitals in Texas", "best hospital", "stroke readmissions in Texas", "heart failure vs heart attack in Texas",
  ];
  for (const q of UNMAPPED) {
    check(`not rewritten: "${q}"`, map(q).mapped === undefined, JSON.stringify(map(q).mapped));
  }
  check(`"hart" alone is never corrected ("hospitals in Hart County")`, map("hospitals in Hart County").corrections.length === 0);
  check("a heart typo that is also a county name is corrected before resolution", correctPlaceCollidingTypos("hart checkup") === "heart checkup" && correctPlaceCollidingTypos("Hart Problem Texas") === "Heart problem Texas" && correctPlaceCollidingTypos("hert attak") === "heart attack");
  check("...and Hart County itself is untouched", correctPlaceCollidingTypos("hospitals in Hart County") === "hospitals in Hart County" && correctPlaceCollidingTypos("Hart County Hospital") === "Hart County Hospital" && correctPlaceCollidingTypos("hospital in Hartwell") === "hospital in Hartwell");
  check("a misspelling is corrected in place, punctuation kept", map("Penumonia, please!").correctedText === "Pneumonia, please!", map("Penumonia, please!").correctedText);
  check("every group has a base the vocabulary can answer (non-empty phrases)", LAY_GROUPS.every((g) => g.phrases.length > 0 && g.base.length > 0));

  // -------------------------------------------------------------------------------------------- 3. hook
  console.log("\n3 - the hook: no model call for a mapped phrase; misspelt unsupported topics refused");
  let modelCalls = 0;
  const stub = async () => {
    modelCalls++;
    return { status: "fallback" as const, canonical_question: null, reason: null, unsupported_terms: [] };
  };
  const hook = (q: string) => normalizeQuestion(q, DOMAIN_CAPABILITIES, stub) as Promise<any>;

  const mapped = await hook("penumonia checkup");
  check("mapped phrase -> canonicalQuestion with lay-vocabulary meta, model NOT called", mapped?.canonicalQuestion === PN && mapped?.meta?.source === "lay-vocabulary" && modelCalls === 0, JSON.stringify(mapped));
  check("meta carries interpretation, filler_dropped, corrected, alternates", typeof mapped?.meta?.interpretation === "string" && mapped.meta.filler_dropped === "checkup" && mapped.meta.corrected === "penumonia > pneumonia" && String(mapped.meta.alternates).split("\n").length === 1, JSON.stringify(mapped?.meta));
  // Batch 5B-1: "chruch owned" and "stroke hospitals" are registered now (a typo-corrected, deterministic rewrite
  // through the new lay groups, not a refusal) - see runtime/lay-vocabulary.ts LAY_GROUPS "church-owned" and "stroke".
  const mappedChurch = await hook("chruch owned");
  check(`"chruch owned" -> church-owned hospitals, model NOT called (Batch 5B-1)`, mappedChurch?.canonicalQuestion === "Show me church-owned hospitals" && mappedChurch?.meta?.source === "lay-vocabulary" && modelCalls === 0, JSON.stringify(mappedChurch));
  const mappedStroke = await hook("stroke hospitals");
  check(`"stroke hospitals" -> stroke mortality, model NOT called (Batch 5B-1)`, mappedStroke?.canonicalQuestion === STROKE && mappedStroke?.meta?.source === "lay-vocabulary" && modelCalls === 0, JSON.stringify(mappedStroke));
  const refusedRaw = await hook("hospital acquired infections");
  check("a raw pre-check hit is unchanged (source pre-check, model NOT called)", refusedRaw?.unsupportedTerms?.[0] === "hospital acquired infections" && modelCalls === 0);
  const passthrough = await hook("hospitls in Texas");
  check("no phrase mapped: the model is asked, on the corrected text", modelCalls === 1 && (passthrough === null || passthrough?.meta?.corrected === "hospitls > hospitals"), JSON.stringify(passthrough));
  modelCalls = 0;
  const heartFailure = await hook("hospital for heart failure in Texas");
  check("a formal condition question the pipeline cannot answer is mapped, not sent to the model", heartFailure?.canonicalQuestion === `${HF} in Texas` && modelCalls === 0, JSON.stringify(heartFailure));

  // -------------------------------------------------------------------------------------------- 4. engine
  console.log("\n4 - the engine end to end (front door wired, model stubbed to `fallback`)");
  process.env.LLM_FIRST_FRONT_DOOR_ENABLED = "true";
  const runtime = createDomainRuntime(healthcareDomain);
  const sqlExecutor = new SqlExecutor(new SupabaseDatabaseAdapter(createClient(env.supabaseUrl, env.supabaseServiceRoleKey)));
  const makeEngine = (options: { fillerWords?: readonly string[]; hook?: ((q: string) => Promise<any>) | null }) =>
    createRuntimeEngine({
      runtime,
      semantic: createSemanticResolver(runtime.registry, runtime.entityProvider),
      planner: new QueryPlanner(options.fillerWords ? { fillerWords: options.fillerWords } : {}),
      executionPlanMapper: new ExecutionPlanMapper(),
      executor: sqlExecutor,
      preprocessQuestion: (question: string) => expandUppercaseStateAbbreviations(correctPlaceCollidingTypos(question)),
      ...(options.hook === null ? {} : { llmFallback: (options.hook ?? ((q: string) => normalizeQuestion(q, DOMAIN_CAPABILITIES, stub))) as any }),
    });
  const engine = makeEngine({ fillerWords: HEALTHCARE_FILLER_WORDS });
  const realLog = console.log;
  const quiet = async <T,>(fn: () => Promise<T>): Promise<T> => {
    console.log = () => {};
    try {
      return await fn();
    } finally {
      console.log = realLog;
    }
  };
  const runOn = (target: ReturnType<typeof makeEngine>, question: string, extra: Record<string, unknown> = {}) =>
    quiet(() => target.execute({ question, ...extra }) as Promise<any>);
  const run = (question: string, extra: Record<string, unknown> = {}) => runOn(engine, question, extra);
  const sqlCalls = (r: any) => (r.trace ?? []).reduce((sum: number, g: any) => sum + (g.sqlCalls ?? 0), 0);
  const llmGate = (r: any) => [...(r.trace ?? [])].reverse().find((g: any) => g.phase === "llm-normalization");

  const ENGINE_CASES: [string, RegExp | undefined][] = [
    ["penumonia checkup", /Pneumonia/],
    ["heart problem Texas", /Acute Myocardial Infarction Texas/],
    ["best hospital for heart issue in California", /Infarction in California/],
    ["chest pain", undefined],
    ["trouble breathing", /COPD/],
    ["What is best hospital for breathing problem?", /COPD/],
    ["hospital for heart", undefined],
    ["Hey show me hospital for heart", undefined],
    ["hospital for breathing", /COPD/],
    ["pneumonia screening", /Pneumonia/],
    ["I need hospital for pneumonia checkup", /Pneumonia/],
    ["Show me hospital for penumonia checkup in Texas", /Pneumonia in Texas/],
    ["I get out of breath easily, which hospital in Arizona?", /COPD in Arizona/],
    ["my dad has trouble breathing, best hospital in Ohio", /COPD in Ohio/],
    ["hip problem best hospital in Ohio", /hip and knee/],
    ["heart trouble in Florida", /Infarction in Florida/],
    ["chest infection hospital in Georgia", /Pneumonia in Georgia/],
    ["hospital for a lung infection in Florida", /Pneumonia in Florida/],
    ["is there a hospital for heart surgery in California", /CABG in California/],
    ["best hospital for bypass checkup", /CABG/],
    ["good hospital", /best hospitals/],
    ["which hospital is good", /best hospitals/],
    ["show me some hospitals", /best hospitals/],
    ["hospitals near me", /best hospitals/],
    ["good hospital near me", /best hospitals/],
    ["recommend a good hospital in Texas", /best hospitals in Texas/],
    ["goverment owned", /government hospitals/],
    ["hart problem", /Infarction/],
    ["hart checkup", /Infarction/],
    ["hospital for heart failure in Texas", /Heart Failure in Texas/],
    ["heart attack Texas", /Infarction Texas/],
  ];
  for (const [question, expectCanon] of ENGINE_CASES) {
    const r = await run(question, { includeSuggestions: false });
    const gate = llmGate(r);
    const canon = String(gate?.detail?.canonicalQuestion ?? "");
    check(
      `answers: "${question}"`,
      r.success === true && r.rowCount > 0 && gate?.status === "rewritten" && gate?.detail?.source === "lay-vocabulary" && (expectCanon === undefined || expectCanon.test(canon)),
      `success=${r.success} rows=${r.rowCount} err=${r.error} gate=${gate?.status} src=${gate?.detail?.source} canon=${canon}`,
    );
  }

  // every alternate the vocabulary can offer, for a state-scoped and a nationwide question, must be answerable
  const seen = new Set<string>();
  for (const group of LAY_GROUPS) {
    for (const alternate of group.alternates ?? []) {
      for (const suffix of ["", " in Texas"]) {
        const q = `${alternate.base}${suffix}`;
        if (seen.has(q)) continue;
        seen.add(q);
        const r = await run(q, { dryRun: true });
        check(`alternate is answerable: "${q}"`, r.success === true, `err=${r.error}`);
      }
    }
  }
  for (const guidance of SCOPE_GUIDANCE) {
    for (const chip of guidance.chips) {
      if (seen.has(chip)) continue;
      seen.add(chip);
      const r = await run(chip, { dryRun: true });
      check(`scope-guidance chip is answerable: "${chip}"`, r.success === true, `err=${r.error}`);
    }
  }

  // Phase 8: a refusal never reaches SQL
  // Batch 5B-1: "stroke hospitals", "chruch owned"/"church owned" and "military hospitals" are registered now
  // (mapped or resolved, not refused) - their still-unsupported readmission wording and an unaffected topic take their place.
  // Batch 5B-2: "sepsis hospitals" is registered now.
  for (const question of ["stroke readmission", "sepsis mortality", "hospital acquired infections", "hospital wide readmission", "emergency department", "hospitals in the bay area", "decile"]) {
    const r = await run(question);
    const gate = llmGate(r);
    check(`refused with 0 SQL: "${question}"`, r.success === false && sqlCalls(r) === 0 && gate?.status === "unsupported", `success=${r.success} sql=${sqlCalls(r)} gate=${gate?.status}`);
  }
  {
    // Batch 5B-1: "chruch owned" (the earlier misspelling example) is registered now, so this checks the plain
    // pre-check refusal names the exact topic in the trace instead.
    const r = await run("hospital acquired infections");
    check(`the refusal names the exact topic ("hospital acquired infections") in the trace`, String(llmGate(r)?.detail?.unsupportedTerms) === "hospital acquired infections" && llmGate(r)?.detail?.source === "pre-check", JSON.stringify(llmGate(r)?.detail));
  }

  // -------------------------------------------------------------------------------------------- 5. planner filler
  console.log("\n5 - the query planner reads the domain's filler words as data");
  {
    const plain = makeEngine({ hook: null });
    const withFiller = makeEngine({ fillerWords: HEALTHCARE_FILLER_WORDS, hook: null });
    const plainPlanner = new QueryPlanner();
    const fillerPlanner = new QueryPlanner({ fillerWords: HEALTHCARE_FILLER_WORDS });
    const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
    const resolved = semantic.resolve("best hospital for a checkup");
    check(
      "without filler words, a leftover 'checkup' means the question is not fully understood",
      !plainPlanner.isFullyUnderstood(resolved.normalizedQuery, resolved.matches, runtime.domain.entities),
    );
    check(
      "with the domain's filler words, the same question is fully understood",
      fillerPlanner.isFullyUnderstood(resolved.normalizedQuery, resolved.matches, runtime.domain.entities),
    );
    // "hart problem": Hart County plus a symptom word. Symptom words stay unaccounted so the vocabulary is reached.
    const hart = semantic.resolve("hart problem");
    check(
      "a symptom word is not tolerated: 'hart problem' (a county plus 'problem') is NOT fully understood, so the vocabulary runs",
      !fillerPlanner.isFullyUnderstood(hart.normalizedQuery, hart.matches, runtime.domain.entities),
    );
    check("the planner's filler words carry no symptom word", !HEALTHCARE_FILLER_WORDS.some((word) => ["problem", "problems", "issue", "issues", "trouble", "symptom", "symptoms"].includes(word)));
    const weather = semantic.resolve("best hospital for the weather");
    check("a non-filler word is still unaccounted with the filler words set", !fillerPlanner.isFullyUnderstood(weather.normalizedQuery, weather.matches, runtime.domain.entities));
    const noDefault = await runOn(plain, "government hospitals for a checkup");
    const defaulted = await runOn(withFiller, "government hospitals for a checkup");
    check("without filler words a leftover 'checkup' stops the default ranking", noDefault.success === false, `success=${noDefault.success}`);
    check("with filler words the default ranking is discovered", defaulted.success === true && defaulted.rowCount > 0, `success=${defaulted.success} err=${defaulted.error}`);
    const stillRefused = await runOn(withFiller, "what's the weather in Texas?");
    check("Bug E holds with the filler words set: an off-topic word still refuses (0 SQL)", stillRefused.success === false && sqlCalls(stillRefused) === 0, `success=${stillRefused.success}`);
  }

  // -------------------------------------------------------------------------------------------- 6. scoped guard
  console.log("\n6 - the scoped guard: a word the front door could not read is never silently dropped");
  {
    const bareHook = (q: string) => normalizeQuestion(q, { unsupportedTopics: DOMAIN_CAPABILITIES.unsupportedTopics }, stub) as Promise<any>;
    const bare = makeEngine({ fillerWords: HEALTHCARE_FILLER_WORDS, hook: bareHook });
    for (const question of ["best hospital for breathing problem", "Best hospital for heart issue in California", "best hospitals with cafeteria food in Texas"]) {
      const r = await runOn(bare, question);
      const guard = [...(r.trace ?? [])].reverse().find((g: any) => g.phase === "unaccounted-word-guard");
      check(
        `still answered, but the words it left out are recorded: "${question}"`,
        r.success === true && r.rowCount > 0 && guard?.status === "annotated" && guard?.detail?.scope === "front-door-declined" && String(guard?.detail?.unaccountedWords ?? "").length > 0,
        `success=${r.success} guard=${JSON.stringify(guard?.detail)}`,
      );
    }
    const e5 = await runOn(bare, "What is best hospital for breathing problem?");
    check("the record names the words it could not match", /breathing/.test(String([...(e5.trace ?? [])].reverse().find((g: any) => g.phase === "unaccounted-word-guard")?.detail?.unaccountedWords)));
    // the recorded 600-run: the 8 answered rows whose front door gave no rewrite keep their answers (a refusal would have broken 4)
    for (const question of ["Where are patients having the best experience?", "What are the best hospitals in Texas when you consider rating and mortality together?", "I want a state-by-state view of the top hospitals."]) {
      const r = await runOn(bare, question);
      check(`a harmless extra word never refuses: "${question}"`, r.success === true && r.rowCount > 0, `success=${r.success} err=${r.error}`);
    }
    // a model clarification that the deterministic layer overrides still answers when every word is accounted for
    const clarify = makeEngine({
      fillerWords: HEALTHCARE_FILLER_WORDS,
      hook: (q: string) => normalizeQuestion(q, { unsupportedTopics: DOMAIN_CAPABILITIES.unsupportedTopics }, async () => ({ status: "need_clarification" as const, canonical_question: null, reason: "Which metric?", unsupported_terms: [] })),
    });
    for (const question of ["best hosptials", "best hospitals in general"]) {
      const r = await runOn(clarify, question);
      check(`still answered when every word is accounted for: "${question}"`, r.success === true && r.rowCount > 0, `success=${r.success} err=${r.error}`);
    }
    // the vocabulary maps these before the guard is ever reached
    for (const question of ["What is best hospital for breathing problem?", "Best hospital for heart issue in California"]) {
      const r = await run(question);
      check(`with the vocabulary the same question is answered: "${question}"`, r.success === true && r.rowCount > 0, `success=${r.success}`);
    }
  }

  // -------------------------------------------------------------------------------------------- 7. graceful messages
  console.log("\n7 - the graceful messages and chips");
  {
    const coverage = DOMAIN_CAPABILITIES.coverageSummary!;
    const guidance = DOMAIN_CAPABILITIES.scopeGuidance!;
    // Batch 5B-1: "stroke" and "church owned" are registered now (no longer scope-guidance topics); the readmission
    // wording that stays unsupported for each takes their place.
    const stroke = buildScopeMessage(["stroke readmission"], guidance, coverage);
    check("scope message: echoes the intent, states coverage, points to the questions", /^I understand you're looking for stroke readmission or complications - only stroke mortality is tracked, but I don't have that\. I currently track heart attack, heart failure, pneumonia/.test(stroke) && stroke.endsWith("Try one of the questions below."), stroke);
    check(`scope message uses the topic's guidance label ("hospital-wide readmission ...")`, buildScopeMessage(["hospital wide readmission"], guidance, coverage).startsWith("I understand you're looking for hospital-wide readmission - only hospital-wide mortality is tracked,"));
    check("scope message for a topic with no guidance quotes what was asked", buildScopeMessage(["zebra crossing"], guidance, coverage).startsWith(`I understand you're looking for "zebra crossing",`));
    check("unaccounted message names the words", buildUnaccountedMessage(["quiet", "environment"], coverage).startsWith(`I couldn't match "quiet environment" to something I track.`));
    // the summary name guard: "CO." (Colorado) ends a sentence, "Co." (company) is an abbreviation
    const rowsCO = [{ hospital_name: "ADVENTHEALTH CASTLE ROCK", city: "CASTLE ROCK", state: "CO", overall_rating: 5 }, { hospital_name: "ADVENTIST HEALTH HOWARD MEMORIAL", city: "WILLITS", state: "CA", overall_rating: 5 }];
    check(`a sentence ending in a state code ("... Castle Rock, CO. Other facilities ...") is not read as a name`, findUngroundedNames("The table lists AdventHealth Castle Rock in Castle Rock, CO. Other facilities include Adventist Health Howard Memorial in Willits, CA.", "best hospital", rowsCO, DOMAIN_CAPABILITIES.states).length === 0, JSON.stringify(findUngroundedNames("The table lists AdventHealth Castle Rock in Castle Rock, CO. Other facilities include Adventist Health Howard Memorial in Willits, CA.", "best hospital", rowsCO, DOMAIN_CAPABILITIES.states)));
    check("a company abbreviation still joins a name (\"Acme Co. Hospital\" is checked as one name)", findUngroundedNames("The list includes Zeta Health Co. Hospital in Ohio.", "q", rowsCO, DOMAIN_CAPABILITIES.states).length === 1);
    check("a hospital that is not in the rows is still caught", findUngroundedNames("The list includes Zeta Memorial Hospital in Ohio.", "q", rowsCO, DOMAIN_CAPABILITIES.states).length === 1);
    check("ignored-words note names what the answer leaves out", buildIgnoredNote(["breathing"]) === `I didn't match "breathing" to something I track, so this answer leaves it out.`);
    check("composeSummary joins note, tie and summary in that order and skips the missing", composeSummary("A.", undefined, "C.") === "A. C." && composeSummary(undefined, undefined, undefined) === undefined && composeSummary("A.", "B.", "C.") === "A. B. C.");
    check("composeSummary ends a note that has no full stop (a model's interpretation) before the next sentence", composeSummary("Read 'x' as y", "The table lists ten.") === "Read 'x' as y. The table lists ten." && composeSummary("Read 'x' as y") === "Read 'x' as y");
    check("no markdown reaches the plain-text UI (apps/web renders summary and error in a bare <p>)", ![stroke, buildUnaccountedMessage(["x"], coverage), map("chest pain").mapped?.interpretation ?? ""].some((text) => /[*_`#]/.test(text)));

    // Batch 5B-1: "stroke hospitals" and "chruch owned" are registered now, so their guidance moves to the
    // readmission/complication wording that still has no measure.
    const strokeChips = scopeGuidanceChips("stroke readmission");
    check("stroke readmission -> stroke mortality, heart attack, heart failure (cardiovascular intent)", JSON.stringify(strokeChips) === JSON.stringify([STROKE, AMI, HF]), JSON.stringify(strokeChips));
    check(`a topic finds its guidance ("hospital wide readmission")`, scopeGuidanceChips("hospital wide readmission")?.[0] === "Show me hospitals with lowest Mortality Rate for Hospital-Wide Mortality");
    check("a question naming no unsupported topic has no guidance chips", scopeGuidanceChips("best hospital") === undefined && scopeGuidanceChips("penumonia checkup") === undefined);

    // Batch 5B-2: "sepsis hospitals" is registered now.
    for (const question of ["stroke readmission", "sepsis mortality", "emergency department", "hospital wide readmission", "hospital acquired infections", "wait times", "hospitals in the bay area", "decile"]) {
      const r = await run(question, { includeSuggestions: true });
      const guided = scopeGuidanceChips(question) ?? [];
      const generic = new Set(["Show me 5-star hospitals in Texas", "Best hospitals in Texas and California", "Tell me about Mayo Clinic"]);
      check(
        `${question}: three relevant chips, none of the static triple`,
        r.success === false && guided.length > 0 && (r.suggestions ?? []).length > 0 && (r.suggestions ?? []).every((chip: string) => guided.includes(chip) && !generic.has(chip)),
        JSON.stringify(r.suggestions),
      );
    }
    const offTopic = await run("write me a poem about hospitals", { includeSuggestions: true });
    check("a refusal with no guidance keeps the existing chips (never empty)", offTopic.success === false && (offTopic.suggestions ?? []).length > 0, JSON.stringify(offTopic.suggestions));
  }

  // -------------------------------------------------------------------------------------------- 7b. the model prompt
  console.log("\n7b - the normalizer prompt: plain wording is supplied by the domain, and it agrees with the vocabulary");
  {
    const groupOf = (phrase: string) => LAY_GROUPS.find((group) => group.phrases.includes(phrase));
    for (const { phrases, condition } of PROMPT_CONDITIONS) {
      for (const phrase of phrases) {
        check(`prompt phrase "${phrase}" is a vocabulary phrase read as ${condition}`, groupOf(phrase)?.base.endsWith(`for ${condition}`) === true, groupOf(phrase)?.base ?? "not in the vocabulary");
      }
    }
    for (const phrase of PROMPT_JOINT_PHRASES) {
      check(`prompt phrase "${phrase}" is a hip/knee vocabulary phrase`, groupOf(phrase)?.id === "joint");
    }
    const rules = (DOMAIN_CAPABILITIES.prompts?.normalizer?.rules ?? []).join("\n");
    check("the rules tell the model to map plain wording, never refuse it", /map it, never refuse it/.test(rules) && !/status fallback, never guessed/.test(rules));
    check("the rules name filler and its report field", /filler_dropped/.test(rules) && /interpretation/.test(rules));
    const gateway = readFileSync(resolve(__dirname, "../packages/llm-model-gateway/src/llm-model-gateway.ts"), "utf-8");
    for (const phrase of ["heart pain", "chest pain", "heart problem", "trouble breathing", "HEART LANGUAGE", "shortness of breath"]) {
      check(`no layperson phrase hard-coded in the gateway: "${phrase}"`, !gateway.includes(phrase));
    }
  }

  // -------------------------------------------------------------------------------------------- 8. tie disclosure
  console.log("\n8 - the tie disclosure (D5)");
  {
    check("wording, nationwide", formatTieNote(384, 10, 5, { nationwide: true }) === "384 hospitals nationwide hold a 5-star overall rating, displaying the first 10 alphabetically. Add a state or condition to narrow your search.", formatTieNote(384, 10, 5, { nationwide: true }));
    check("wording, one state", formatTieNote(41, 10, 5, { nationwide: false, state: "Texas" }).startsWith("41 hospitals in Texas hold a 5-star overall rating"));
    const columns = { facility_id: "1", hospital_name: "A", state: "TX", city: "X", county: "Y", ownership: "Z", overall_rating: 5 };
    const rows = Array.from({ length: 10 }, () => ({ ...columns }));
    const fake = (count: number) => async () => ({ success: true, rows: [{ tied_count: count }] });
    check("no note when the tie is not larger than the page", (await describeOverallRatingTies({ rows, parameters: { direction: "DESC", multiState: false }, run: fake(10) })) === undefined);
    check("note when more hospitals share the rating than are shown", (await describeOverallRatingTies({ rows, parameters: { direction: "DESC", multiState: false }, run: fake(384) }))?.startsWith("384 hospitals nationwide") === true);
    check("no note when the rows do not all hold one rating", (await describeOverallRatingTies({ rows: [...rows.slice(0, 9), { ...columns, overall_rating: 4 }], parameters: { multiState: false }, run: fake(384) })) === undefined);
    check("no note for a multi-state request (a fixed 5 per state)", (await describeOverallRatingTies({ rows, parameters: { multiState: true }, run: fake(384) })) === undefined);
    check("no note for a different shape (one best hospital per state)", (await describeOverallRatingTies({ rows: rows.map(({ state, facility_id, hospital_name, overall_rating }) => ({ state, facility_id, hospital_name, overall_rating })), parameters: { multiState: false }, run: fake(384) })) === undefined);
    check("no note when the count fails", (await describeOverallRatingTies({ rows, parameters: { multiState: false }, run: async () => ({ success: false, rows: [] }) })) === undefined);

    const live = async (question: string) => {
      const r = await run(question);
      return { r, note: await describeOverallRatingTies({ rows: r.rows, parameters: r.executedParameters, run: (template, parameters) => sqlExecutor.execute(template, parameters) as any }) };
    };
    const national = await live("best hospital");
    check(`"best hospital": the engine reports its parameters`, national.r.success === true && national.r.executedParameters?.direction === "DESC", JSON.stringify(national.r.executedParameters));
    check(`"best hospital": a nationwide tie disclosure with the real count`, /^\d{3,} hospitals nationwide hold a 5-star overall rating, displaying the first 10 alphabetically\./.test(national.note ?? ""), String(national.note));
    const texas = await live("best hospitals in Texas");
    check(`"best hospitals in Texas": a Texas-scoped count, smaller than nationwide`, /^\d+ hospitals in Texas hold a 5-star overall rating/.test(texas.note ?? "") && Number((texas.note ?? "").split(" ")[0]) < Number((national.note ?? "").replace(/,/g, "").split(" ")[0]), String(texas.note));
    const owned = await live("Show me government hospitals with best Hospital Overall Rating in Ohio");
    check("an ownership-scoped ranking is described as 'in this search' (the count uses the same ownership filter)", owned.note === undefined || /^\d+ hospitals in this search hold/.test(owned.note), String(owned.note));
    const multi = await live("best hospitals in Texas and Ohio");
    check("a multi-state ranking gets no disclosure", multi.note === undefined, String(multi.note));
    const mortality = await live("Show me hospitals with lowest Mortality Rate for Pneumonia");
    check("a non-rating ranking gets no disclosure", mortality.note === undefined, String(mortality.note));
    // the disclosed count is what a direct count says
    const direct = (await sqlExecutor.execute({ ...OVERALL_RATING_TIE_COUNT_TEMPLATE }, { multiState: false, topRating: "5" })) as any;
    check("the nationwide count equals a direct count of 5-star hospitals", Number(String(national.note ?? "").replace(/,/g, "").split(" ")[0]) === Number(direct.rows?.[0]?.tied_count), `note=${national.note} direct=${JSON.stringify(direct.rows?.[0])}`);
  }

  console.log(`\n${"=".repeat(60)}\nRESULT: ${passed} passed, ${failed} failed (${passed + failed} total)\n${"=".repeat(60)}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
