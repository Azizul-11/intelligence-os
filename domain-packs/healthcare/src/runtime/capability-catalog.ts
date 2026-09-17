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
