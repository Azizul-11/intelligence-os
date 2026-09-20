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
import { STATE_NAMES_BY_CODE } from "./execution-strategy";
import { OWNERSHIP } from "./ownership-directory";

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
 */
const KNOWN_UNSUPPORTED_TOPICS = [
  "pressure ulcer", "pressure ulcers", "patient safety indicator", "patient safety indicators", "psi", "in-hospital falls",
  "falls with fracture", "blood clot", "blood clots", "hospital acquired infection", "hospital acquired infections",
  "kidney injury", "hospital wide", "all cause", "trouble breathing", "breathing problems", "lung infection",
  "heart surgery", "heart problem", "checkup",
  "nurse communication", "doctor communication", "communication", "cleanliness", "cleanest", "sanitary", "quietest",
  "quiet", "sleep", "responsiveness", "communication about medicines", "discharge information",
  "instructions for going home", "would recommend", "recommend", "courtesy", "listen carefully",
  "emergency services", "birthing friendly", "birthing-friendly", "hospital type", "acute care", "critical access",
  "childrens", "children's", "psychiatric", "rural emergency", "physician owned", "tribal", "military",
  "department of defense", "church owned",
  "address", "phone number", "patient records", "poem",
  "since", "over time", "years ago", "decile",
  // Batch 3: DC is a jurisdiction the platform does not register (10 hospitals in the warehouse, no state filter for it),
  // written three ways; the deterministic pre-check matches each literally, whatever punctuation the LLM would add.
  "dc", "d.c.", "district of columbia",
];

const REGISTERED_ALIAS_PHRASES = new Set(
  healthcareAliases.flatMap((alias) => alias.aliases).map((phrase) => phrase.toLowerCase()),
);

// A registered METRIC alias is supported vocabulary, whatever concept shares the phrase: "patient satisfaction" is a
// concept with no measure behind it, but it is also an alias of the Patient Experience metric, which the platform answers.
const METRIC_ALIAS_PHRASES = new Set(
  healthcareAliases.filter((alias) => alias.type === "metric").flatMap((alias) => alias.aliases).map((phrase) => phrase.toLowerCase()),
);

export const DOMAIN_CAPABILITIES: CapabilityCatalog = {
  metrics: healthcareMetrics.map((metric) => ({
    displayName: metric.displayName,
    ...(metric.description ? { description: metric.description } : {}),
  })),
  states: Array.from(new Set(STATE_NAMES_BY_CODE.values())).sort(),
  ownerships: Array.from(new Set(Array.from(OWNERSHIP.values()).map((value) => value.label))),
  concepts: CONCEPTS_WITH_REAL_MEASURES.map((concept) => ({
    displayName: concept.displayName,
    aliases: healthcareAliases.find((alias) => alias.canonical === concept.id)?.aliases ?? [],
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
};
