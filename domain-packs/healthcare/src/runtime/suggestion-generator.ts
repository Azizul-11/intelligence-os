import type { SuggestionContext } from "@intelligence/domain-sdk";
import { llmGateway } from "@intelligence/llm-model-gateway";

import { healthcareMetrics } from "../metrics";
import { concepts } from "../concepts";
import { healthcareAliases } from "../aliases";
import { healthcareSqlTemplates } from "../sql";
import { STATE_NAMES_BY_CODE } from "./execution-strategy";
import { clarificationChips, scopeGuidanceChips } from "./lay-vocabulary";
import { HEALTHCARE_PROMPT_WORDING } from "./prompt-wording";
import { HealthcareTemplateSelector } from "./template-selector";

/**
 * PrePhase 9.5 Round 3 (suggestion diversity for concept queries): the
 * same concepts-with-a-real-measure-code filter `capability-catalog.ts`
 * already established, rebuilt here rather than imported from there to
 * avoid a runtime-package -> capability-catalog -> back dependency; the
 * underlying source data (`concepts/*.ts`, `aliases/*.ts`) is identical
 * either way, never a second, independently-maintained list.
 */
const CONCEPTS_WITH_REAL_MEASURES = concepts.filter((concept) => concept.measureCodesByMetric);

function conceptAliases(conceptId: string): string[] {
  return healthcareAliases.find((alias) => alias.canonical === conceptId)?.aliases ?? [];
}

const METRIC_WORDS_BY_ID: Record<string, string> = {
  "mortality-rate": "mortality rate",
  "readmission-rate": "readmission",
  // Batch 5B-2: matches the generic "rate" fallback below already used for an unlisted metric - stated explicitly
  // so a chip reads "Pressure Ulcer rate" rather than relying on the fallback by coincidence.
  "patient-safety-indicator": "rate",
  // Batch 5B-3: a patient-survey dimension chip reads "best Cleanliness score" (a composite alias the pipeline answers).
  "patient-experience": "score",
};

/** Batch 5B-3: "lowest" is the best end only for a lower-is-better metric; a survey dimension's best end is "best". */
const bestEndWord = (metricId: string): string =>
  healthcareMetrics.find((metric) => metric.id === metricId)?.lowerIsBetter ? "lowest" : "best";

/**
 * Phase 3.5: a listing, count or profile is not a measure, so a chip never ranks by it ("best Hospital List" was
 * offered after every plain location list); the overall rating is the measure those answers pivot to.
 */
const NON_MEASURE_METRICS = new Set(["hospital-list", "hospital-count", "hospital-detail"]);
const measureMetricId = (metricId: string): string => (NON_MEASURE_METRICS.has(metricId) ? "hospital-overall-rating" : metricId);

/** Phase 3.5: a chip names its measure's good end - "lowest Mortality Rate", "best Patient Experience" - never "best Mortality Rate". */
const rankedPhrase = (metricId: string, name?: string): string =>
  `${bestEndWord(metricId)} ${name ?? metricDisplayName(metricId) ?? "Hospital Overall Rating"}`;

/**
 * Phase 3.5: a model may reword a pool chip into its opposite ("best Mortality Rate" came back as "highest Mortality
 * Rate", a valid question about the worst hospitals). The pool only ever asks for the good end of a measure, so a
 * reworded chip that pairs a lower-is-better measure with a "high" word, or a higher-is-better one with a "low" word,
 * has changed meaning and is dropped. Exact words only.
 */
const LOWER_IS_BETTER_WORDS = /\b(mortality|death|deaths|die|readmission|readmissions|readmitted|complications?|sepsis|ulcers?|sores?|falls?|fractures?|clots?|puncture|hemorrhage|hematoma|injury|pneumothorax|dehiscence|psi|safety indicators?)\b/i;
const HIGH_WORDS = /\b(highest|most|worst|bottom|greatest|largest|poorest)\b/i;
const LOW_WORDS = /\b(lowest|fewest|least|worst|bottom|poorest)\b/i;

export function chipKeepsDirection(text: string): boolean {
  return LOWER_IS_BETTER_WORDS.test(text) ? !HIGH_WORDS.test(text) : !LOW_WORDS.test(text);
}

/**
 * Tier1 Task 6: three real, already-verified-working queries (confirmed
 * throughout Tier0/Tier1 dogfooding and this task's own audit) used as
 * the fully-generic last resort when nothing else in this file applies
 * (no `executionPlan`, or a genuinely off-topic question that matches no
 * `TOPIC_FALLBACKS` keyword below). Domain-owned literal strings (like
 * OWNERSHIP/STATES elsewhere in this file's siblings), never invented at
 * request time.
 */
export const SAFE_FALLBACK_SUGGESTIONS = [
  "Show me 5-star hospitals in Texas",
  "Best hospitals in Texas and California",
  "Tell me about Mayo Clinic",
] as const;

/**
 * Tier1 T6 regression fix (bug 2 - repetitive fallback): when the "zero
 * semantic candidates" dead end fires (bare "ratings"/"safeties", etc.),
 * a keyword found in the user's own question routes to a topic-relevant
 * triple instead of always the same 3 generic strings. Genuinely
 * off-topic questions (no keyword match, e.g. "What is the weather like
 * today?") still fall through to SAFE_FALLBACK_SUGGESTIONS.
 */
const TOPIC_FALLBACKS: readonly { keywords: readonly string[]; suggestions: readonly string[] }[] = [
  {
    keywords: ["safety", "safeties"],
    suggestions: [
      "Show me hospitals with best Safety Performance",
      "Show me hospitals with best Hospital Overall Rating",
      "Show me hospitals with best Patient Experience",
    ],
  },
  {
    keywords: ["rating", "ratings"],
    suggestions: [
      "Show me hospitals with best Hospital Overall Rating",
      "Show me 5-star hospitals in Texas",
      "Show me hospitals with lowest Mortality Rate",
    ],
  },
  {
    keywords: ["mortality", "death", "deaths"],
    suggestions: [
      "Show me hospitals with lowest Mortality Rate",
      "Show me hospitals with best Hospital Overall Rating",
      "Show me non-profit hospitals with lowest AMI mortality rate",
    ],
  },
  {
    keywords: ["readmission", "readmissions"],
    suggestions: [
      "Show me hospitals with lowest Readmission Rate",
      "Show me hospitals with best Hospital Overall Rating",
      "Show me hospitals with lowest Mortality Rate",
    ],
  },
  {
    keywords: ["experience", "satisfaction"],
    suggestions: [
      "Show me hospitals with best Patient Experience",
      "Show me hospitals with best Hospital Overall Rating",
      "Show me hospitals with best Safety Performance",
    ],
  },
];

/**
 * A small, fixed set of major states already used throughout this
 * engagement's own verified examples - reused only as a mechanical
 * "pick a peer state different from the one(s) already in scope" pivot,
 * never as an exhaustive or authoritative state list (STATES in
 * entity-provider.ts remains the actual directory). Order matters here:
 * the peer rotation below picks the NEXT entry after the current
 * state(s), wrapping around, so which peer gets suggested varies with
 * which state the question is already about (Tier1 T6 regression fix,
 * bug 2 - Texas no longer always pivots to California).
 */
const PEER_STATE_CODES = ["TX", "CA", "FL", "NY"] as const;

/**
 * Phase 3.5: the ownership pivots cover the 5B-1 sub-labels too (church-owned, physician-owned), not only non-profit
 * and proprietary. Military is left out of ranking chips: it has no rating (D11), so a ranking chip for it is a list.
 */
const OWNERSHIP_ROTATION = ["non-profit", "proprietary", "church-owned", "physician-owned", "government"] as const;

/**
 * Phase 3.5: neighbours for the jurisdictions the fixed peer rotation above never offers (5B-5), and the reverse, so
 * a Maryland or Virginia answer can pivot to DC and a Florida or New York answer to Puerto Rico.
 */
const PEER_JURISDICTIONS: Readonly<Record<string, readonly string[]>> = {
  DC: ["MD", "VA"],
  MD: ["DC", "VA"],
  VA: ["DC", "MD"],
  PR: ["FL", "NY"],
  FL: ["PR", "GA"],
  NY: ["NJ", "PR"],
  GU: ["CA", "HI"],
  VI: ["PR", "FL"],
  AS: ["HI", "CA"],
  MP: ["GU", "HI"],
};

/**
 * Phase 3.5: the 5B measures a question with no condition of its own is offered (an overall-rating answer, a list,
 * an ownership or type filter), rotated so successive answers show different ones. Ordered by family for the
 * metric the answer was about: survey dimensions after a patient-experience answer, safety indicators after a
 * safety answer, outcomes otherwise.
 */
const SHOWCASE_BY_FAMILY: Readonly<Record<string, readonly string[]>> = {
  outcomes: ["stroke", "hospital-wide-mortality", "acute-myocardial-infarction", "heart-failure", "pneumonia"],
  safety: ["sepsis", "in-hospital-fall-with-fracture", "perioperative-blood-clot", "pressure-ulcer", "patient-safety-composite"],
  survey: ["hcahps-cleanliness", "hcahps-quietness", "hcahps-nurse-communication", "hcahps-doctor-communication", "hcahps-recommend"],
};
const FAMILY_OF_METRIC: Readonly<Record<string, string>> = {
  "mortality-rate": "outcomes",
  "readmission-rate": "outcomes",
  "patient-safety-indicator": "safety",
  "safety-performance": "safety",
  "patient-experience": "survey",
};

/** Phase 3.5: type and flag chips (5B-4), phrased the way the deterministic pipeline answers them. */
const ATTRIBUTE_CHIPS: readonly ((scope: string) => string)[] = [
  (scope) => `Show me hospitals with emergency services${scope}`,
  (scope) => `Show me birthing-friendly hospitals${scope}`,
  (scope) => `Show me critical access hospitals${scope}`,
];

/** Phase 3.5: nationwide answers can offer a jurisdiction the platform answers since 5B-5. */
const JURISDICTION_CHIPS = ["Show me best hospitals in District of Columbia", "Show me best hospitals in Puerto Rico"] as const;

/** A small stable number from the question, so rotations differ between questions but not between runs. */
function rotationSeed(text: string): number {
  let seed = 0;
  for (const character of text.toLowerCase()) {
    seed = (seed * 31 + character.charCodeAt(0)) % 9973;
  }
  return seed;
}

function rotate<T>(items: readonly T[], seed: number): T[] {
  if (items.length === 0) return [];
  const start = seed % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

/** "Show me hospitals with lowest Stroke mortality rate<scope>" - the pivot chip for one concept, or undefined. */
function conceptChip(conceptId: string, preferredMetricId: string, scopeSuffix: string): string | undefined {
  const concept = CONCEPTS_WITH_REAL_MEASURES.find((candidate) => candidate.id === conceptId);
  if (!concept) return undefined;
  const metricId = concept.measureCodesByMetric?.[preferredMetricId] ? preferredMetricId : Object.keys(concept.measureCodesByMetric ?? {})[0];
  if (!metricId) return undefined;
  // A safety indicator or a survey dimension is written in its canonical form ("... lowest Patient Safety Indicator
  // for Pressure Ulcer"): the short "<alias> rate/score" form is not answerable for every one of them (measured:
  // "best Recommend Hospital score", "lowest Patient Safety Composite rate" were not).
  if (metricId === "patient-safety-indicator" || metricId === "patient-experience") {
    return `Show me hospitals with ${rankedPhrase(metricId)} for ${concept.displayName}${scopeSuffix}`;
  }
  // Hip/knee's measure under "mortality-rate" is its complication rate (COMP_HIP_KNEE), so a chip never calls it a
  // mortality rate; the complication wording is an alias the pipeline answers.
  if (concept.id === "elective-primary-tha-tka" && metricId === "mortality-rate") {
    return `Show me hospitals with lowest hip and knee replacement complication rate${scopeSuffix}`;
  }
  const shortName = conceptAliases(concept.id)[0] ?? concept.displayName;
  return `Show me hospitals with ${bestEndWord(metricId)} ${shortName} ${METRIC_WORDS_BY_ID[metricId] ?? "rate"}${scopeSuffix}`;
}

function stateName(code: string): string {
  return STATE_NAMES_BY_CODE.get(code) ?? code;
}

function metricDisplayName(metricId: string): string | undefined {
  return healthcareMetrics.find((metric) => metric.id === metricId)?.displayName;
}

/**
 * LLM call-count audit (R1 companion, 2026-09-18): `rankable: true` on a
 * MetricDefinition is a declaration, not proof a ranking template exists -
 * "Emergency Department Visits" and "Length of Stay" both declare it but
 * ship no `<metric>-ranking` template, so every "Show me hospitals with
 * best <that metric>" suggestion built from them ALWAYS failed its own
 * dry-run validation (measured: exactly 2 such candidates in every
 * 11-19 entry pool, ~40% odds one is picked). Derived from the domain's
 * own registered templates via the same selector the runtime uses - never
 * a hardcoded metric-id list - so a metric that later gains a ranking
 * template is offered again automatically.
 */
const ENABLED_TEMPLATE_IDS: ReadonlySet<string> = new Set(
  healthcareSqlTemplates.filter((template) => template.enabled !== false).map((template) => template.id),
);
const rankingTemplateSelector = new HealthcareTemplateSelector();

function hasRankingTemplate(metricId: string): boolean {
  return ENABLED_TEMPLATE_IDS.has(rankingTemplateSelector.select(metricId, "ranking"));
}

function filterValues(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).map(String);
}

/**
 * Tier1 T6 regression fix (bug 2 - repetitive depth probe): picks the
 * NEXT comparable/rankable metric after the current one in
 * `healthcareMetrics`' own declared order, wrapping around - instead of
 * always the first alternate found (which was always "Mortality Rate"
 * whenever the current metric was "Hospital Overall Rating", since that
 * metric is declared first). Which metric gets suggested now varies with
 * which metric the question is already about.
 */
function nextComparableMetric(currentMetricId: string, requireRankingTemplate = false) {
  const pool = healthcareMetrics.filter(
    (metric) =>
      (metric.rankable || metric.comparable) && (!requireRankingTemplate || hasRankingTemplate(metric.id)),
  );
  if (pool.length === 0) {
    return undefined;
  }
  const currentIndex = pool.findIndex((metric) => metric.id === currentMetricId);
  for (let step = 1; step <= pool.length; step++) {
    const candidate = pool[(currentIndex + step + pool.length) % pool.length];
    if (candidate && candidate.id !== currentMetricId) {
      return candidate;
    }
  }
  return undefined;
}

function nextPeerState(currentStates: readonly string[]): string | undefined {
  const anchor = currentStates[currentStates.length - 1];
  const anchorIndex = PEER_STATE_CODES.indexOf(anchor as (typeof PEER_STATE_CODES)[number]);
  for (let step = 1; step <= PEER_STATE_CODES.length; step++) {
    const candidate = PEER_STATE_CODES[(anchorIndex + step + PEER_STATE_CODES.length) % PEER_STATE_CODES.length]!;
    if (!currentStates.includes(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * PrePhase 9.5 (suggestion diversity fix): every comparable/rankable
 * metric OTHER than the current one - not just the single "next" pick
 * `nextComparableMetric` returns. Used to build a genuinely diverse POOL
 * for the LLM to select from (see `buildSuccessSuggestionPool` and
 * `generateHealthcareSuggestionsWithLLMRephrasing` below) - live
 * dogfooding (docs/Frontend test/PrePhase 9 LLM.md) showed that even
 * with rephrasing, always offering the SAME one alternate metric still
 * felt repetitive across turns.
 */
function allComparableMetricsExcept(currentMetricId: string) {
  return healthcareMetrics.filter(
    (metric) => (metric.rankable || metric.comparable) && metric.id !== currentMetricId,
  );
}

/**
 * Sub-Goal A (success path): depth probe, breadth/pivot, and entity-dive
 * candidates derived mechanically from the resolved ExecutionPlan/rows -
 * never a hardcoded second hospital name (see the design doc's own
 * rejection of that option). Deliberately generous (may return
 * candidates that don't pan out) - create-runtime-engine.ts's dry-run
 * validation is what actually guarantees correctness; this function only
 * proposes.
 */
function successPathSuggestions(context: SuggestionContext): string[] {
  const candidates: string[] = [];
  const plan = context.executionPlan;

  if (!plan) {
    return SAFE_FALLBACK_SUGGESTIONS.slice();
  }

  const stateFilter = plan.filters.find((filter) => filter.field === "state");
  const ownershipFilter = plan.filters.find((filter) => filter.field === "ownership");
  const hospitalFilter = plan.filters.find(
    (filter) => filter.field === "hospital" && filter.operator === "=",
  );
  const stateValues = stateFilter ? filterValues(stateFilter.value) : [];
  const stateNames = stateValues.map(stateName);

  // Entity dive: same resolved facility, a different rankable measure.
  const firstRow = context.rows?.[0];
  const hospitalName =
    hospitalFilter && firstRow && typeof firstRow["hospital_name"] === "string"
      ? (firstRow["hospital_name"] as string)
      : undefined;

  if (hospitalName) {
    const diveMetric = nextComparableMetric(plan.metric);
    if (diveMetric) {
      candidates.push(`What is ${hospitalName}'s ${diveMetric.displayName.toLowerCase()}?`);
    }
  } else {
    // Depth probe: a different comparable/rankable metric, same scope -
    // rotates with the current metric (see nextComparableMetric).
    const alternateMetric = nextComparableMetric(measureMetricId(plan.metric), true);
    if (alternateMetric) {
      const scope = stateNames.length > 0 ? ` in ${stateNames.join(" and ")}` : "";
      candidates.push(`Show me hospitals with ${rankedPhrase(alternateMetric.id)}${scope}`);
    }

    // Breadth/pivot: mechanical ownership filter add/drop, same metric -
    // rotates between ownership categories instead of always "non-profit".
    const primaryMetricId = measureMetricId(plan.metric);
    if (ownershipFilter) {
      const scope = stateNames.length > 0 ? ` in ${stateNames.join(" and ")}` : "";
      candidates.push(`Show me hospitals with ${rankedPhrase(primaryMetricId)}${scope}`);
    } else {
      const ownershipPivot = OWNERSHIP_ROTATION[plan.metric.length % OWNERSHIP_ROTATION.length];
      candidates.push(`Show me ${ownershipPivot} hospitals with ${rankedPhrase(primaryMetricId)}`);
    }

    // Breadth/pivot: add or extend a state scope - the peer state
    // rotates with which state(s) are already in scope (see
    // nextPeerState), instead of always pivoting to California.
    if (stateValues.length >= 1) {
      const peer = nextPeerState(stateValues);
      if (peer) {
        const allNames = [...stateNames, stateName(peer)];
        candidates.push(
          stateValues.length === 1
            ? `Best hospitals in ${allNames[0]} and ${allNames[1]}`
            : `Show me 5-star hospitals in ${allNames.slice(0, -1).join(", ")} and ${allNames[allNames.length - 1]}`,
        );
      }
    }
  }

  candidates.push(...SAFE_FALLBACK_SUGGESTIONS);
  return candidates;
}

/**
 * PrePhase 9.5 (suggestion diversity fix): a genuinely larger pool of
 * mechanically-valid candidates for the LLM to pick 3 diverse ones from,
 * instead of `successPathSuggestions()`'s own single depth-probe/
 * breadth-pivot/state-pivot triple. Every entry here is built the exact
 * same mechanical way `successPathSuggestions()` already does (only the
 * domain's own declared metrics/states/ownership categories/resolved
 * entity - never invented) - this function only widens how many of each
 * kind get offered, it does not introduce a new construction mechanism.
 * `generateHealthcareSuggestionsWithLLMRephrasing()` is what actually
 * narrows this down to 3, via `llmGateway.selectAndRephraseSuggestions`.
 */
export function buildSuccessSuggestionPool(context: SuggestionContext): string[] {
  const plan = context.executionPlan;
  if (!plan) {
    return SAFE_FALLBACK_SUGGESTIONS.slice();
  }

  const pool: string[] = [];
  const stateFilter = plan.filters.find((filter) => filter.field === "state");
  const ownershipFilter = plan.filters.find((filter) => filter.field === "ownership");
  const hospitalFilter = plan.filters.find(
    (filter) => filter.field === "hospital" && filter.operator === "=",
  );
  // PrePhase 9.5 Round 3: a concept-scoped query (AMI/CABG/COPD/etc)
  // carries a `measureCode` filter alongside the generic top-level
  // metric - used below to pivot the pool across OTHER concepts too,
  // not just other top-level metrics, so "heart attack death rate"'s
  // suggestions can offer "bypass surgery readmission" / "heart failure
  // mortality" etc, not only "Safety Performance"/"Patient Experience".
  const measureCodeFilter = plan.filters.find((filter) => filter.field === "measureCode");
  const currentConcept = measureCodeFilter
    ? CONCEPTS_WITH_REAL_MEASURES.find(
        (concept) => concept.measureCodesByMetric?.[plan.metric] === measureCodeFilter.value,
      )
    : undefined;
  const stateValues = stateFilter ? filterValues(stateFilter.value) : [];
  const stateNames = stateValues.map(stateName);
  const scopeSuffix = stateNames.length > 0 ? ` in ${stateNames.join(" and ")}` : "";

  const firstRow = context.rows?.[0];
  const hospitalName =
    hospitalFilter && firstRow && typeof firstRow["hospital_name"] === "string"
      ? (firstRow["hospital_name"] as string)
      : undefined;

  // Batch 5A-1: the pool is built one dimension at a time (metric, concept, ownership, peer state) and interleaved at
  // the end, so any first three of it - what the caller falls back to when the model is slow - already differ in kind.
  const conceptItems: string[] = [];
  const ownershipItems: string[] = [];
  const peerItems: string[] = [];

  if (hospitalName) {
    for (const metric of allComparableMetricsExcept(plan.metric)) {
      pool.push(`What is ${hospitalName}'s ${metric.displayName.toLowerCase()}?`);
    }
    pool.push(`Tell me about ${hospitalName}`);
  } else {
    // Phase 3.5: a listing, count or profile answer pivots on the overall rating (never "best Hospital List"), and
    // every measure chip names its good end ("lowest Mortality Rate").
    const primaryMetricId = measureMetricId(plan.metric);
    const seed = rotationSeed(context.question);
    const attributeItems: string[] = [];

    // Depth probe: every OTHER comparable metric, not just the next one -
    // only those with a registered ranking template (see hasRankingTemplate).
    for (const metric of allComparableMetricsExcept(primaryMetricId)) {
      if (!hasRankingTemplate(metric.id)) continue;
      pool.push(`Show me hospitals with ${rankedPhrase(metric.id)}${scopeSuffix}`);
    }

    // Depth probe, concept-scoped: the siblings in the answered measure's own family first ("stroke" -> heart attack,
    // hospital-wide mortality), then two from the other families (a safety indicator, a survey dimension).
    // Phase 3.5: an answer with no condition of its own gets the 5B showcase for its metric's family instead, rotated.
    const conceptIds: string[] = [];
    if (currentConcept) {
      const sameFamily = CONCEPTS_WITH_REAL_MEASURES.filter((other) => other.id !== currentConcept.id && other.measureCodesByMetric?.[plan.metric]);
      const otherFamilies = Object.entries(SHOWCASE_BY_FAMILY)
        .filter(([family]) => family !== FAMILY_OF_METRIC[plan.metric])
        .map(([, ids]) => rotate(ids, seed)[0]!);
      conceptIds.push(...rotate(sameFamily.map((other) => other.id), seed), ...otherFamilies);
    } else {
      const family = FAMILY_OF_METRIC[primaryMetricId];
      const ordered = family ? [family, ...Object.keys(SHOWCASE_BY_FAMILY).filter((name) => name !== family)] : rotate(Object.keys(SHOWCASE_BY_FAMILY), seed);
      const lists = ordered.map((name) => rotate(SHOWCASE_BY_FAMILY[name]!, seed));
      for (let index = 0; index < 5; index++) {
        for (const list of lists) {
          if (list[index] !== undefined) conceptIds.push(list[index]!);
        }
      }
    }
    for (const conceptId of [...new Set(conceptIds)]) {
      const chip = conceptChip(conceptId, plan.metric, scopeSuffix);
      if (chip) conceptItems.push(chip);
    }

    // Breadth/pivot: ownership, over all the registered labels (rotated) - uses the current CONCEPT's own short name
    // + metric word when concept-scoped (e.g. "AMI mortality rate"), not the generic top-level metric name.
    const primaryDisplayName = currentConcept
      ? `${bestEndWord(plan.metric)} ${`${conceptAliases(currentConcept.id)[0] ?? currentConcept.displayName} ${METRIC_WORDS_BY_ID[plan.metric] ?? ""}`.trim()}`
      : rankedPhrase(primaryMetricId);
    const ownershipValue = typeof ownershipFilter?.value === "string" ? ownershipFilter.value : undefined;
    if (ownershipValue === "Department of Defense%") {
      // A military (DoD) answer is a list with no ratings (D11): the rated federal hospitals are the veterans ones.
      ownershipItems.push(`Show me veterans hospitals with ${rankedPhrase("hospital-overall-rating")}${scopeSuffix}`);
    } else if (ownershipFilter) {
      ownershipItems.push(`Show me hospitals with ${primaryDisplayName}${scopeSuffix}`);
    }
    for (const ownership of rotate(OWNERSHIP_ROTATION, seed).slice(0, 2)) {
      ownershipItems.push(`Show me ${ownership} hospitals with ${primaryDisplayName}${scopeSuffix}`);
    }

    // Phase 3.5: hospital types and flags (5B-4), in the answer's own scope.
    for (const chip of rotate(ATTRIBUTE_CHIPS, seed).slice(0, 2)) {
      attributeItems.push(chip(scopeSuffix));
    }

    // Breadth/pivot: several peer states, not just the next rotation step. A jurisdiction with neighbours of its own
    // (DC, Puerto Rico, the territories, and the states next to them) uses those first.
    if (stateValues.length >= 1) {
      const peers: string[] = [];
      for (const peer of PEER_JURISDICTIONS[stateValues[stateValues.length - 1]!] ?? []) {
        if (!stateValues.includes(peer)) peers.push(peer);
      }
      let anchor = [...stateValues, ...peers];
      for (let i = 0; peers.length < 3 && i < PEER_STATE_CODES.length; i++) {
        const peer = nextPeerState(anchor);
        if (!peer || peers.includes(peer)) {
          break;
        }
        peers.push(peer);
        anchor = [...anchor, peer];
      }
      for (const peer of peers) {
        peerItems.push(
          stateValues.length === 1
            ? `Best hospitals in ${stateNames[0]} and ${stateName(peer)}`
            : `Show me 5-star hospitals in ${stateNames.join(", ")} and ${stateName(peer)}`,
        );
      }
    } else {
      peerItems.push(...rotate(JURISDICTION_CHIPS, seed));
    }

    // Take one of each kind in turn (the metric items are in `pool`). Phase 3.5: a sibling measure leads, so the first
    // three - the fallback when the model is slow - always offer one.
    const groups = [conceptItems, pool.splice(0, pool.length), ownershipItems, attributeItems, peerItems];
    for (let index = 0; groups.some((group) => index < group.length); index++) {
      for (const group of groups) {
        const item = group[index];
        if (item !== undefined) {
          pool.push(item);
        }
      }
    }
    // A military (DoD) list leads with its rated federal alternative.
    const veterans = ownershipValue === "Department of Defense%" ? pool.findIndex((chip) => chip.startsWith("Show me veterans hospitals")) : -1;
    if (veterans > 0) {
      pool.unshift(...pool.splice(veterans, 1));
    }
  }

  // Batch 5A-1: the static triple ("5-star Texas", "best Texas and California", "Tell me about Mayo Clinic") used to be
  // appended to EVERY pool and was 6 of the 42 chips shown across 16 answers, whatever the question was about. It pads
  // a pool that is too small to choose from and is otherwise left out.
  if (pool.length < 3) {
    pool.push(...SAFE_FALLBACK_SUGGESTIONS);
  }

  return pool;
}

/**
 * Sub-Goal B (failure/recovery path).
 *
 * Identity-ambiguous candidates are CONTINUATION TOKENS, not standalone
 * questions - each one must be exactly what
 * `matchClarificationResponse()` (packages/runtime-engine/src/
 * continuation/match-clarification.ts) can uniquely match against this
 * same response's own `answerability.candidates` (a bare city name when
 * unique among the candidate set, matching that matcher's own
 * city-field-equality check; falling back to "city, state" only if two
 * candidates share a city). Tier1 T6 regression fix (bug 1): the
 * original design used the full original question + a location
 * qualifier, which matched neither the matcher's exact-field check nor
 * its partial-label check (the label includes a county segment the
 * suggestion text didn't), so every click failed with "I couldn't match
 * your response to one of the offered options."
 *
 * Capability-unavailable candidates reuse the same `alternatives[]` data
 * `buildGuidanceMessage()` already renders as prose.
 *
 * Everything else (the "nothing resolved at all" dead end, Group C/D)
 * routes through TOPIC_FALLBACKS by keyword, falling back to
 * SAFE_FALLBACK_SUGGESTIONS only when no keyword matches - see
 * TOPIC_FALLBACKS' own doc comment (Tier1 T6 regression fix, bug 2).
 */
function failurePathSuggestions(context: SuggestionContext): string[] {
  const answerability = context.answerability;

  if (answerability?.reason === "identity-ambiguous" && answerability.candidates) {
    const parsed = answerability.candidates.map((raw) => {
      const label = (raw as { label?: unknown })?.label;
      const parts =
        typeof label === "string"
          ? label
              .split(",")
              .map((part) => part.trim())
              .filter(Boolean)
          : [];
      return { city: parts[0] ?? "", state: parts[parts.length - 1] ?? "" };
    });

    const cityCounts = new Map<string, number>();
    for (const entry of parsed) {
      if (!entry.city) {
        continue;
      }
      const key = entry.city.toLowerCase();
      cityCounts.set(key, (cityCounts.get(key) ?? 0) + 1);
    }

    const tokens: string[] = [];
    // Phase 3.5: every candidate is offered (a county in 4 states showed 3; "Washington" was missing).
    for (const entry of parsed) {
      if (!entry.city) {
        continue;
      }
      const isUniqueCity = (cityCounts.get(entry.city.toLowerCase()) ?? 0) === 1;
      tokens.push(isUniqueCity ? entry.city : `${entry.city}, ${entry.state}`);
    }
    // Deliberately NOT combined with SAFE_FALLBACK_SUGGESTIONS - those
    // are standalone questions, not valid continuation tokens, and
    // create-runtime-engine.ts trusts every candidate here directly
    // (skips dry-run) precisely because this list is continuation-token
    // only.
    return tokens;
  }

  // Batch 5B-4 (D4): "best communication" is answered with a question (nurse, doctor or medicines?); its chips are the
  // three answers, never the generic pool.
  const choices = clarificationChips(context.question);

  if (choices) {
    return [...choices];
  }

  const candidates: string[] = [];

  if (answerability?.reason === "capability-unavailable" && answerability.alternatives) {
    for (const alternative of answerability.alternatives.slice(0, 3)) {
      const displayName = metricDisplayName(alternative.capabilityId);
      if (displayName) {
        candidates.push(`Show me hospitals with ${rankedPhrase(alternative.capabilityId, displayName)}`);
      }
    }
    candidates.push(...SAFE_FALLBACK_SUGGESTIONS);
    return candidates;
  }

  // Batch 5A-1: a question that names something the platform does not answer ("stroke", "church owned") gets three
  // questions that ARE answerable and close to what was asked, not the same static triple every time.
  const guided = scopeGuidanceChips(context.question);

  if (guided) {
    return [...guided];
  }

  const lowerQuestion = context.question.toLowerCase();
  const topicMatch = TOPIC_FALLBACKS.find((topic) =>
    topic.keywords.some((keyword) => lowerQuestion.includes(keyword)),
  );

  candidates.push(...(topicMatch ? topicMatch.suggestions : SAFE_FALLBACK_SUGGESTIONS));
  return candidates;
}

export function generateHealthcareSuggestions(context: SuggestionContext): string[] {
  return context.success ? successPathSuggestions(context) : failurePathSuggestions(context);
}

/**
 * How long Layer 2's optional LLM rephrasing is allowed to hold up a
 * response before falling back to the deterministic list untouched.
 *
 * Live-measured correction: the originally-approved value (800ms) was a
 * proposal, not a measurement - 3 live timed calls against the fastest
 * currently-configured free tier (Groq's `openai/gpt-oss-20b`) came back
 * in 823ms/893ms/1477ms, meaning 800ms would silently discard the LLM
 * response on nearly every real request, defeating Layer 2's entire
 * purpose while still paying for the call. Raised to a value that
 * comfortably covers the observed range while remaining a real, bounded
 * ceiling (never unbounded, always falls back to the instant
 * deterministic list past this point).
 */
const LLM_REPHRASE_RACE_TIMEOUT_MS = 2500; // Batch 5A-1: was 1800; the paid chip tier measured p95 2.0 s, max 2.2 s over 100 calls

function raceWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(undefined);
      }
    }, timeoutMs);
    promise.then(
      (value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(undefined);
        }
      },
    );
  });
}

/**
 * LLM Integration Layer 2 (Contextual Suggestion Co-Pilot), extended in
 * PrePhase 9.5 for diversity, not just wording. The deterministic pool
 * builder above always runs first and its own output IS the bounded
 * vocabulary contract - the LLM is only ever asked to SELECT + rephrase
 * from that already-decided pool, never to choose a metric/state/entity
 * that isn't already in it. Races the LLM call against
 * LLM_REPHRASE_RACE_TIMEOUT_MS so this can never make a response slower
 * than the pre-LLM (Batch 27) baseline - on timeout, failure, or any
 * malformed/wrong-length response, the ORIGINAL deterministic top-3
 * (`successPathSuggestions()`/`failurePathSuggestions()`'s own,
 * already-proven output) is returned unchanged (Universal Core's own
 * dry-run validation is what actually decides which candidates survive
 * to the user either way).
 *
 * Identity-ambiguous candidates are deliberately NEVER sent to the LLM -
 * see the bare-city-token doc comment above (failurePathSuggestions) for
 * why they are continuation tokens, not standalone questions, and must
 * reach create-runtime-engine.ts byte-for-byte as the generator produced
 * them.
 */
export async function generateHealthcareSuggestionsWithLLMRephrasing(
  context: SuggestionContext,
): Promise<string[]> {
  const deterministic = generateHealthcareSuggestions(context);

  if (context.answerability?.reason === "identity-ambiguous") {
    return deterministic;
  }

  // Batch 5A-1: the guidance chips for an unsupported topic are exact, pre-validated questions: no model rewords them.
  if (!context.success && (scopeGuidanceChips(context.question) !== undefined || clarificationChips(context.question) !== undefined)) {
    return deterministic;
  }

  const resolvedMetric = context.executionPlan?.metric;
  const stateFilterValue = context.executionPlan?.filters.find((filter) => filter.field === "state")?.value;
  const resolvedState = stateFilterValue !== undefined ? String(stateFilterValue) : undefined;

  // Success path: a genuinely larger, diverse pool - the LLM SELECTS 3
  // (never invents), so different turns asking the same base question
  // can surface different real facts, not just different wording of
  // the same 3.
  if (context.success) {
    const pool = buildSuccessSuggestionPool(context);
    // Phase 3.5: a military (DoD) answer is a list with no ratings (D11); its pool leads with the rated federal
    // alternative (veterans hospitals), which a model's "diverse" pick tends to skip. It is used as built.
    const military = context.executionPlan?.filters.some((filter) => filter.field === "ownership" && filter.value === "Department of Defense%");
    if (pool.length <= 3 || military) {
      return pool;
    }
    const selected = await raceWithTimeout(
      llmGateway.selectAndRephraseSuggestions(pool, { resolvedMetric, resolvedState }, 3, LLM_REPHRASE_RACE_TIMEOUT_MS, HEALTHCARE_PROMPT_WORDING),
      LLM_REPHRASE_RACE_TIMEOUT_MS,
    );
    // The fallback is the pool's first three, which the interleaving above makes differ in kind (metric / concept /
    // ownership / peer state); before Batch 5A-1 it was the metric rotation, all in the same state.
    if (!selected || selected.length !== 3) {
      return pool.slice(0, 3);
    }
    // Phase 3.5: a pick the model reworded into the opposite direction is dropped; the pool backfills below.
    const kept = selected.filter(chipKeepsDirection);

    // Batch 5A-1: a model picks freely (the paid tier, measured, tends to keep all three in the question's own scope,
    // and phrases some so loosely that the runtime's dry run drops them). So the picks are followed by a chip that
    // pivots the scope (another state, another ownership) if none of them does, and by the rest of the pool as
    // backfill: the runtime validates in order and keeps the first three that answer, so 3 valid, varied chips
    // come back whatever the model did.
    const ownScope = filterValues(context.executionPlan?.filters.find((filter) => filter.field === "state")?.value).map((code) => stateName(code).toLowerCase());
    const pivotsScope = (text: string): boolean => {
      const lower = text.toLowerCase();
      return (
        OWNERSHIP_ROTATION.some((ownership) => lower.includes(ownership)) ||
        PEER_STATE_CODES.some((code) => {
          const name = stateName(code).toLowerCase();
          return !ownScope.includes(name) && lower.includes(name);
        })
      );
    };
    const pivot = pool.find(pivotsScope);
    const ordered = kept.some(pivotsScope) || !pivot ? kept : [...kept.slice(0, 2), pivot, ...kept.slice(2)];

    // Phase 3.5: the backfill skips a plain measure chip whose measure a kept chip already names in other words
    // ("Which hospitals rank highest for Nurse Communication ..." and "... Patient Experience for Nurse Communication"
    // were both shown).
    const measureOf = (chip: string): string | undefined =>
      /^Show me hospitals with (?:lowest|best) /.test(chip)
        ? (/ for (.+?)(?: in .+)?$/.exec(chip)?.[1] ?? /^Show me hospitals with (?:lowest|best) (.+?)(?: in .+)?$/.exec(chip)?.[1])
        : undefined;
    const backfill = pool.filter((chip) => {
      const measure = measureOf(chip)?.toLowerCase();
      return !measure || !ordered.some((kept) => kept !== chip && kept.toLowerCase().includes(measure));
    });

    return [...new Set([...ordered, ...backfill])];
  }

  // Failure path: pool is already small/topic-specific
  // (capability-unavailable's real alternatives, or one TOPIC_FALLBACKS
  // triple) - plain rephrasing, not selection, since there usually isn't
  // a larger pool to select a more diverse subset from.
  const toRephrase = deterministic.slice(0, 3);
  if (toRephrase.length === 0) {
    return deterministic;
  }

  const rephrased = await raceWithTimeout(
    llmGateway.synthesizeSuggestions(
      {
        question: context.question,
        resolvedMetric,
        resolvedState,
        candidates: toRephrase,
      },
      LLM_REPHRASE_RACE_TIMEOUT_MS,
      HEALTHCARE_PROMPT_WORDING,
    ),
    LLM_REPHRASE_RACE_TIMEOUT_MS,
  );

  if (!rephrased || rephrased.length !== toRephrase.length) {
    return deterministic;
  }

  // Phase 3.5: a rewording that reversed its chip's direction falls back to the chip as generated.
  return [...rephrased.map((chip, index) => (chipKeepsDirection(chip) ? chip : toRephrase[index]!)), ...deterministic.slice(3)];
}
