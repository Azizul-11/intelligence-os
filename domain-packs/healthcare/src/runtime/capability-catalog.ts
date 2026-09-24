/**
 * PrePhase 9.5: the healthcare Domain SDK's own declared capability
 * manifest, built entirely from data the domain already owns
 * (`MetricDefinition.displayName`, `STATE_NAMES_BY_CODE`,
 * `OWNERSHIP` directory) - never a second, independently-maintained
 * list. This is what makes the LLM gateway "capability-aware" instead
 * of working from a small hardcoded metric-name string baked into a
 * prompt: the gateway receives this catalog as plain data and only
 * ever quotes it back, never invents beyond it.
 */
import { healthcareMetrics } from "../metrics";
import { healthcareAliases } from "../aliases";
import { concepts } from "../concepts";
import { psiConcepts } from "../concepts/psi";
import { hcahpsDimensionConcepts } from "../concepts/hcahps-dimensions";
import { STATE_NAMES_BY_CODE } from "./execution-strategy";
import { OWNERSHIP } from "./ownership-directory";
import type { PromptWording } from "@intelligence/llm-model-gateway";
import {
  CANONICAL_REPAIRS,
  COVERAGE_SUMMARY,
  HEALTHCARE_FILLER_WORDS,
  LAY_VOCABULARY,
  SCOPE_GUIDANCE,
  type CanonicalRepair,
  type LayVocabulary,
  type ScopeGuidance,
} from "./lay-vocabulary";
import { HEALTHCARE_PROMPT_WORDING } from "./prompt-wording";

export interface CapabilityCatalog {
  metrics: { displayName: string; description?: string }[];
  states: string[];
  ownerships: string[];
  /**
   * PrePhase 9.5 Round 2: condition-specific concepts (AMI, CABG, COPD,
   * Hip/Knee, Heart Failure, Pneumonia) the LLM can rewrite a simple
   * human phrase ("heart attack", "bypass surgery", "hip and knee
   * complication") into - built only from concepts that have a real
   * `measureCodesByMetric` mapping (a genuine SQL path); `aliases` is
   * the exact, already-registered alias list from `aliases/*.ts` (never
   * invented) so a rewrite always lands on a phrase the deterministic
   * pipeline already recognizes.
   */
  concepts: { displayName: string; aliases: string[]; metrics: string[] }[];
  /**
   * Batch 1 (D2): topics this domain KNOWS it cannot answer yet. Two sources, both derived so that registering a
   * capability removes the entry with no other edit: (1) registered concepts with no measure behind them
   * (`measureCodesByMetric` absent: stroke, sepsis, emergency department) - the exact complement of `concepts`
   * above; (2) `KNOWN_UNSUPPORTED_TOPICS` below, minus any phrase that has since become a registered alias.
   * The normalizer reports what it cannot map in `unsupported_terms`; an LLM decline is binding only when a reported
   * term names one of these topics (exact literal, word boundary), so an over-cautious LLM cannot refuse a question
   * the platform answers correctly.
   */
  unsupportedTopics: string[];
  /** A handful of real, pre-verified-working questions - the same shape SAFE_FALLBACK_SUGGESTIONS already uses, extended for onboarding/capability-explanation prompts. */
  exampleAnswerableQuestions: string[];
  /** Illustrative only - what the platform is explicitly NOT for, so the LLM never tries to force-fit an off-topic question into a metric. */
  nonAnswerableExamples: string[];
  /**
   * Batch 5A-1: the domain's layperson vocabulary (runtime/lay-vocabulary.ts). The orchestrator's generic mapper turns
   * a layperson phrase ("heart problem", "trouble breathing") into the canonical question the pipeline answers, before
   * any model is called; the same data is quoted into the normalizer prompt.
   */
  layVocabulary?: LayVocabulary;
  /** Batch 5A-1: for a topic the platform does not answer, what to say and which answerable questions to offer instead. */
  scopeGuidance?: ScopeGuidance[];
  /** Batch 5A-1: one sentence naming what the platform answers, for the "I currently track ..." reply. */
  coverageSummary?: string;
  /** Batch 5A-1: single words the query planner may leave unaccounted (filler that asks for nothing measurable). */
  fillerWords?: string[];
  /** Batch 5A-2: the domain's words for every prompt the gateway assembles (runtime/prompt-wording.ts); the gateway only quotes them. */
  prompts?: PromptWording;
  /** Batch 5A-2: what a canonical question the model wrote that the pipeline cannot rank means here (lay-vocabulary.ts). */
  canonicalRepairs?: CanonicalRepair[];
}

const METRIC_DISPLAY_NAME_BY_ID = new Map(healthcareMetrics.map((m) => [m.id, m.displayName]));

/**
 * Only concepts with a real, deterministic SQL path (a `measureCodesByMetric`
 * mapping) are exposed to the gateway - e.g. sepsis/stroke/emergency-department
 * are registered `ConceptDefinition`s with no such mapping (no warehouse
 * measure code backs them yet), and must never be offered to the LLM as
 * something it can confidently rewrite into - that would let it invent an
 * analytical fact the deterministic pipeline can't actually honor.
 */
const CONCEPTS_WITH_REAL_MEASURES = concepts.filter((c) => c.measureCodesByMetric);
const CONCEPTS_WITHOUT_MEASURES = concepts.filter((c) => !c.measureCodesByMetric);

/**
 * Batch 1 (D2): what the warehouse holds or users ask for but the platform does not answer today (2026-09-20 DB
 * audit and the DogfoodingV1 catalog's UNREGISTERED / NO-DATA / UNSUPPORTED rows): measures not registered (HCAHPS
 * sub-scores, PSI family, hospital-wide mortality), hospital attributes not exposed as filters (type, emergency
 * services, birthing-friendly), ownership sub-labels, columns not projected (address, phone), time windows (only the
 * latest snapshot is loaded) and plainly off-topic requests. Lower-case exact phrases; matched on word boundaries
 * against what the normalizer reports, never fuzzily. A phrase that becomes a registered alias drops out (below).
 * Batch 3: the same list now also drives a deterministic pre-check on the raw question (normalizer-hook.ts), so
 * a phrase here must be unsupported wherever it appears in a question - "last year" left (it trips on "my dad had a
 * heart attack last year", a narrative sentence, not a time-window request).
 * Batch 5A-1: narrowed to what is really unanswerable. Layperson and everyday wording is NOT here any more: "heart
 * problem", "trouble breathing", "lung infection", "heart surgery", "checkup", "recommend", "would recommend",
 * "quiet", "sleep", "communication" and "courtesy" refused answerable asks (10 of 30 probe sentences, 19 of 50 messy
 * queries) and are the domain's layperson vocabulary now (lay-vocabulary.ts). The multi-word survey phrases stay.
 * Added: prices, wait times, volumes, doctors and time trends, which no table holds.
 */
const KNOWN_UNSUPPORTED_TOPICS = [
  "hospital acquired infection", "hospital acquired infections",
  // Batch 5B-2: the 11 individual PSIs, the PSI 90 composite and postoperative sepsis are registered
  // (concepts/psi.ts, concepts/sepsis.ts); PSI_05 and PSI_07 do not exist in the warehouse and stay refused, as
  // does any measure the sepsis word implies but the data does not have (a mortality or a survival rate).
  "psi 5", "psi 05", "psi 7", "psi 07",
  "sepsis mortality", "sepsis survival", "sepsis recovery",
  // Batch 5B-1: stroke and hospital-wide mortality are registered (concepts/stroke.ts, concepts/hospital-wide-mortality.ts);
  // only the measure the warehouse does not have stays refused, as its own longer literal (the pre-check reports only
  // the longest matching topic, so "stroke mortality" no longer matches these but "stroke readmission" still does).
  "stroke readmission", "stroke complications", "hospital wide readmission",
  // Batch 5B-3: the 8 patient-survey dimensions and the summary star are registered (concepts/hcahps-dimensions.ts);
  // only what the survey data does not hold stays refused: staff responsiveness (H_COMP_3) and care transition
  // (H_COMP_7) have 0 rows, and single survey items ("nurses listen carefully") are deferred (D3).
  "staff responsiveness", "responsiveness", "care transition", "care transitions", "listen carefully",
  // Batch 5B-4: hospital types, emergency services and birthing-friendly are registered
  // (runtime/hospital-attribute-directory.ts); the emergency-department topics below (waits, volumes) stay refused.
  // Batch 5B-1: physician, tribal, military and church-owned ownership sub-labels are registered
  // (runtime/ownership-directory.ts) - the Batch 4 hold on this and on DC ("deferred to post-baseline capability
  // expansion") is lifted for this batch.
  "address", "phone number", "phone numbers", "telephone", "patient records", "poem",
  // Batch 5C: a region (the platform searches by state, county or city), medical knowledge, and peer similarity.
  "bay area", "symptoms of", "symptom of", "similar to",
  "since", "over time", "years ago", "decile",
  "ed wait", "ed waits", "er wait", "er waits", "wait time", "wait times", "volumes", "price", "prices", "pricing",
  "how much does", "how much is", "how much do", "doctors", "surgeons", "time trend", "time trends",
  // Batch 5B-5: DC ("dc", "d.c.", "district of columbia", refused since Batch 3) and the territories are registered
  // jurisdictions now (runtime/entity-provider.ts STATES).
];

const REGISTERED_ALIAS_PHRASES = new Set(
  healthcareAliases.flatMap((alias) => alias.aliases).map((phrase) => phrase.toLowerCase()),
);

// A registered METRIC alias is supported vocabulary, whatever concept shares the phrase: "patient satisfaction" is a
// concept with no measure behind it, but it is also an alias of the Patient Experience metric, which the platform answers.
const METRIC_ALIAS_PHRASES = new Set(
  healthcareAliases.filter((alias) => alias.type === "metric").flatMap((alias) => alias.aliases).map((phrase) => phrase.toLowerCase()),
);

/**
 * Batch 5B-2: the 12 PSI-family concepts (11 individual PSIs + sepsis, now Postoperative Sepsis) show only their
 * first, most formal alias in the CONDITIONS line (which happens to equal the display name for every one of them,
 * so the bracket reads "Name (Name)") - the full synonym list stays in aliases/psi.ts and aliases/sepsis.ts for
 * deterministic resolution, which costs no prompt tokens. Registering all 12 with their full 2-alias lists measured
 * 11,510 characters; this alone brings it down to the measured 11,248 (see the I1 guard in
 * verify-llm-first-front-door.ts for the final number and the size-guard move). No pre-existing concept's prompt
 * view changes (several live-model suites depend on seeing all of theirs).
 */
const COMPACT_PROMPT_CONCEPT_IDS = new Set<string>([...psiConcepts.map((concept) => concept.id), "sepsis"]);

/**
 * Batch 5B-3: the patient-survey dimensions are not clinical conditions, so they are not listed under CONDITIONS
 * (which also prints each name twice, "Name (Name)"). The normalizer prompt names them once, in its own SURVEY TOPICS
 * rule (prompt-wording.ts), and RULE 6 counts that list as supported. They stay fully registered for deterministic
 * resolution; this set only keeps them out of the CONDITIONS line.
 */
const SURVEY_CONCEPT_IDS = new Set<string>(hcahpsDimensionConcepts.map((concept) => concept.id));

export const DOMAIN_CAPABILITIES: CapabilityCatalog = {
  metrics: healthcareMetrics.map((metric) => ({
    displayName: metric.displayName,
    ...(metric.description ? { description: metric.description } : {}),
  })),
  states: Array.from(new Set(STATE_NAMES_BY_CODE.values())).sort(),
  ownerships: Array.from(new Set(Array.from(OWNERSHIP.values()).map((value) => value.label))),
  concepts: CONCEPTS_WITH_REAL_MEASURES.filter((concept) => !SURVEY_CONCEPT_IDS.has(concept.id)).map((concept) => ({
    displayName: concept.displayName,
    aliases: (() => {
      const all = healthcareAliases.find((alias) => alias.canonical === concept.id)?.aliases ?? [];
      return COMPACT_PROMPT_CONCEPT_IDS.has(concept.id) ? all.slice(0, 1) : all;
    })(),
    metrics: Object.keys(concept.measureCodesByMetric ?? {}).map(
      (metricId) => METRIC_DISPLAY_NAME_BY_ID.get(metricId) ?? metricId,
    ),
  })),
  unsupportedTopics: Array.from(
    new Set([
      ...CONCEPTS_WITHOUT_MEASURES.flatMap((concept) => [
        concept.displayName.toLowerCase(),
        ...(healthcareAliases.find((alias) => alias.canonical === concept.id)?.aliases ?? []).map((phrase) => phrase.toLowerCase()),
      ]).filter((topic) => !METRIC_ALIAS_PHRASES.has(topic)),
      ...KNOWN_UNSUPPORTED_TOPICS.filter((topic) => !REGISTERED_ALIAS_PHRASES.has(topic)),
    ]),
  ),
  exampleAnswerableQuestions: [
    "Best hospitals in Texas",
    "Show me non-profit hospitals with lowest mortality rate",
    "Hospitals with best Safety Performance in California",
    "Tell me about Mayo Clinic",
    // Live-verified 2026-09-13 (scripts/verify-llm-layer0-conversational.ts):
    // a bare "Which hospitals have a 5 star rating?" (no state scope)
    // fails with a missing-parameter refusal - the star-rating filter
    // needs a geographic scope to avoid the single-record ambiguity gate.
    // State-scoped phrasing is the proven-working shape used throughout
    // this engagement (see SAFE_FALLBACK_SUGGESTIONS above).
    "Show me 5-star hospitals in Texas",
  ],
  nonAnswerableExamples: ["weather today", "who is president", "stock price", "general trivia"],
  layVocabulary: LAY_VOCABULARY,
  scopeGuidance: [...SCOPE_GUIDANCE],
  coverageSummary: COVERAGE_SUMMARY,
  fillerWords: [...HEALTHCARE_FILLER_WORDS],
  prompts: HEALTHCARE_PROMPT_WORDING,
  canonicalRepairs: [...CANONICAL_REPAIRS],
};
