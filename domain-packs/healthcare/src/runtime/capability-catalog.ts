/** The healthcare Domain SDK's declared capability manifest, built from data the domain already owns - never a second, independently-maintained list. The LLM gateway quotes this catalog back, never invents beyond it. */
import { healthcareMetrics } from "../metrics";
import { healthcareAliases } from "../aliases";
import { concepts } from "../concepts";
import { psiConcepts } from "../concepts/psi";
import { hcahpsDimensionConcepts } from "../concepts/hcahps-dimensions";
import { STATE_NAMES_BY_CODE } from "./execution-strategy";
import { OWNERSHIP } from "./ownership-directory";
import { CITIES } from "./geographic-directory";
import type { PromptWording } from "@intelligence/llm-model-gateway";
import {
  AMBIGUOUS_TERMS,
  CANONICAL_REPAIRS,
  COVERAGE_SUMMARY,
  HEALTHCARE_FILLER_WORDS,
  LAY_VOCABULARY,
  SCOPE_GUIDANCE,
  type AmbiguousTerm,
  type CanonicalRepair,
  type LayVocabulary,
  type ScopeGuidance,
} from "./lay-vocabulary";
import { HEALTHCARE_PROMPT_WORDING } from "./prompt-wording";

export interface CapabilityCatalog {
  metrics: { displayName: string; description?: string }[];
  states: string[];
  /** 2,000 sweep (Batch C): the two-letter codes behind `states`, for the phrase mapper (a code typed in lower case). */
  stateCodes?: string[];
  /** 2,000 sweep (Batch D): the lower-case city names the geographic directory knows, for a city typed in lower case. */
  cityNames?: string[];
  ownerships: string[];
  /** Condition-specific concepts the LLM can rewrite a human phrase into - only concepts with a real `measureCodesByMetric` mapping, aliases from the already-registered alias list. */
  concepts: { displayName: string; aliases: string[]; metrics: string[] }[];
  /** Batch 1 (D2): topics this domain KNOWS it cannot answer yet - derived (registering a capability removes the entry automatically). An LLM decline is binding only when it names one of these. */
  unsupportedTopics: string[];
  /** 2,000 sweep (Batch A2): phrases in which a topic word is not the topic, keyed by topic (see UNSUPPORTED_TOPIC_EXCEPTIONS). */
  unsupportedTopicExceptions?: Record<string, string[]>;
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
  /**
   * 2,000 sweep (Batch E): unsupported topics as regular expressions. A year: the data is one CMS release, so "in 2019",
   * "since 2020" or "in 2030" asks for a period it does not hold (every catalog row naming a year expects a refusal). A
   * numeric threshold ("below 15%", "between 80% and 90%"): the rankings compare hospitals, they do not filter by value.
   */
  unsupportedPatterns?: string[];
  /** 2,000 sweep (Batch D): a word that alone is ambiguous; a question using it is clarified, whatever the model wrote. */
  ambiguousTerms?: AmbiguousTerm[];
  /**
   * Batch Normalizer Enhancement: a topic keyed here is a refusal only when the question ALSO contains one of these
   * companion words. "years ago" alone is a narrative connector ("my grandpa had bypass surgery years ago and now
   * needs another one"); only a comparison word ("better", "changed", "trend"...) turns it into a real, unanswerable
   * historical-snapshot request ("was the rating better five years ago?" - the only two catalog rows that need it).
   */
  unsupportedTopicRequires?: Record<string, string[]>;
}

const METRIC_DISPLAY_NAME_BY_ID = new Map(healthcareMetrics.map((m) => [m.id, m.displayName]));

/** Only concepts with a real `measureCodesByMetric` mapping are exposed to the gateway - offering an unmapped one would let the LLM invent a fact the pipeline can't honor. */
const CONCEPTS_WITH_REAL_MEASURES = concepts.filter((c) => c.measureCodesByMetric);
const CONCEPTS_WITHOUT_MEASURES = concepts.filter((c) => !c.measureCodesByMetric);

/**
 * Batch 1 (D2): what the platform does not answer today. Lower-case exact phrases, matched on word boundaries, never
 * fuzzily. A phrase that becomes a registered alias drops out automatically. Also drives a deterministic pre-check
 * on the raw question (Batch 3). Batch 5A-1 narrowed this to what's really unanswerable - layperson wording moved
 * to the layperson vocabulary (lay-vocabulary.ts) instead.
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
  // 2,000 sweep (Batch A2): the survey item's own wording (D3, item level) - "doctors explain things" alone is the doctor
  // communication score now (UNSUPPORTED_TOPIC_EXCEPTIONS), so the item keeps its refusal by this literal instead.
  "in a way you can understand",
  // 2,000 sweep (Batch D): the survey's top-box share (only the linear score is loaded), one patient's own record, and
  // a specialty no table holds. Narrow on purpose: "diagnosed with heart failure, which hospital ..." is a real ask.
  "9 or 10", "top box", "what diagnosis", "which diagnosis", "plastic surgery", "cosmetic surgery",
  // Batch E: schooling, not a hospital measure ("the best university to study nursing near Mayo Clinic"). Not "university":
  // university hospitals are hospitals.
  "study nursing", "nursing school", "nursing schools",
  // Batch E: what no table holds, which the model answered with a neighbouring measure (central line infections as
  // accidental puncture, wrong-site surgery as PSI 15, pain management as communication about medicines) or dropped
  // ("best cancer hospitals in Texas" answered as the overall rating). Checked against the 2,000 catalog: every question
  // containing one expects a refusal.
  "central line", "central line infections", "clabsi", "c diff", "mrsa", "wrong site surgery", "wrong site",
  "parking", "pain management", "how busy", "weight loss surgery", "bariatric", "cancer hospital", "cancer hospitals",
  "cancer care", "cancer treatment", "oncology", "dental", "dentist", "patients admitted", "yesterday", "medicaid",
  "insurance", "medical records", "rehab", "rehabilitation",
  // Batch 5B-5: DC ("dc", "d.c.", "district of columbia", refused since Batch 3) and the territories are registered
  // jurisdictions now (runtime/entity-provider.ts STATES).
  // V4 fix plan (Batch 1): organ transplants and pediatric surgery are not registered concepts (no measure the
  // warehouse holds names them); refusing them at the pre-check, before any model call, is what already happens for
  // "cancer care" and "weight loss surgery" above. Added because the unaccounted-word guard's new limit-count
  // tolerance (this batch) would otherwise have let a stacked "top N"/"top five" carry a question with one of these
  // words past the guard undetected, into a wrong answer instead of the refusal it already got today by coincidence.
  "transplant", "pediatric surgery", "kids surgery",
];

/** Batch A2: phrases where a topic word isn't actually the topic (e.g. "doctors explain things" is the doctor communication score, not a request for clinician info). */
const UNSUPPORTED_TOPIC_EXCEPTIONS: Record<string, string[]> = {
  since: ["since my", "since our", "since his", "since her", "since their", "since i", "since we", "since he", "since she", "since they", "since your"],
  // Batch Normalizer Enhancement: "doctors actually explain" (an adverb between "doctors" and the verb) and "doctors
  // listen"/"doctors treat" (two verbs the earlier list did not cover) were still refused - the Doctor Communication
  // survey item, not a request for clinician-level information.
  doctors: [
    "doctors explain", "doctors who explain", "doctors that explain", "doctors actually explain", "doctors really explain",
    "doctors communicate", "doctors who communicate", "doctors that communicate",
    "doctors listen", "doctors who listen", "doctors that listen", "doctors actually listen",
    "doctors treat", "doctors who treat", "doctors that treat",
  ],
  address: ["that address", "which address", "who address", "to address"],
};

const REGISTERED_ALIAS_PHRASES = new Set(
  healthcareAliases.flatMap((alias) => alias.aliases).map((phrase) => phrase.toLowerCase()),
);

// A registered METRIC alias is supported vocabulary, whatever concept shares the phrase: "patient satisfaction" is a
// concept with no measure behind it, but it is also an alias of the Patient Experience metric, which the platform answers.
const METRIC_ALIAS_PHRASES = new Set(
  healthcareAliases.filter((alias) => alias.type === "metric").flatMap((alias) => alias.aliases).map((phrase) => phrase.toLowerCase()),
);

/** Batch 5B-2: the 12 PSI-family concepts show only their first alias in the CONDITIONS line to save prompt tokens (11,510 -> 11,248 chars) - full synonyms stay registered for deterministic resolution. */
const COMPACT_PROMPT_CONCEPT_IDS = new Set<string>([...psiConcepts.map((concept) => concept.id), "sepsis"]);

/** Batch 5B-3: patient-survey dimensions aren't clinical conditions, so kept out of the CONDITIONS line - named once instead in the normalizer's own SURVEY TOPICS rule. */
const SURVEY_CONCEPT_IDS = new Set<string>(hcahpsDimensionConcepts.map((concept) => concept.id));

export const DOMAIN_CAPABILITIES: CapabilityCatalog = {
  metrics: healthcareMetrics.map((metric) => ({
    displayName: metric.displayName,
    ...(metric.description ? { description: metric.description } : {}),
  })),
  states: Array.from(new Set(STATE_NAMES_BY_CODE.values())).sort(),
  stateCodes: Array.from(STATE_NAMES_BY_CODE.keys()).sort(),
  cityNames: Array.from(CITIES.keys()),
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
  unsupportedTopicExceptions: UNSUPPORTED_TOPIC_EXCEPTIONS,
  exampleAnswerableQuestions: [
    "Best hospitals in Texas",
    "Show me non-profit hospitals with lowest mortality rate",
    "Hospitals with best Safety Performance in California",
    "Tell me about Mayo Clinic",
    // A bare "5 star rating?" with no state fails - the star-rating filter needs a geographic scope.
    "Show me 5-star hospitals in Texas",
  ],
  nonAnswerableExamples: ["weather today", "who is president", "stock price", "general trivia"],
  layVocabulary: LAY_VOCABULARY,
  scopeGuidance: [...SCOPE_GUIDANCE],
  coverageSummary: COVERAGE_SUMMARY,
  fillerWords: [...HEALTHCARE_FILLER_WORDS],
  prompts: HEALTHCARE_PROMPT_WORDING,
  canonicalRepairs: [...CANONICAL_REPAIRS],
  ambiguousTerms: [...AMBIGUOUS_TERMS],
  unsupportedPatterns: [
    "\\b(?:19|20)\\d{2}\\b",
    "\\b(?:above|below|under|over|between|less than|more than|greater than|at least|at most)\\s+\\d+(?:\\.\\d+)?\\s*(?:%|percent)",
  ],
  unsupportedTopicRequires: {
    "years ago": ["better", "worse", "trend", "changed", "compare", "compared", "comparison", "improved", "declined", "used to be"],
  },
};
