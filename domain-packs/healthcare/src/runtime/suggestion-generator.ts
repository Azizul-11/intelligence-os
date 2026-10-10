/** Builds follow-up suggestion chips: a deterministic pool from the resolved plan/rows, optionally selected + reworded by the LLM gateway, always dry-run validated by the caller. */
import type { SuggestionContext } from "@intelligence/domain-sdk";
import { llmGateway } from "@intelligence/llm-model-gateway";

import { healthcareMetrics } from "../metrics";
import { concepts } from "../concepts";
import { healthcareAliases } from "../aliases";
import { healthcareSqlTemplates } from "../sql";
import { STATE_NAMES_BY_CODE } from "./execution-strategy";
import { hospitalIdentityDirectory } from "./hospital-identity-directory";
import { clarificationChips, scopeGuidanceChips } from "./lay-vocabulary";
import { HEALTHCARE_PROMPT_WORDING } from "./prompt-wording";
import { HealthcareTemplateSelector } from "./template-selector";

/** Same filter capability-catalog.ts uses, rebuilt here to avoid a back-dependency. */
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

/** Phase 3.5: a listing, count or profile is not a measure, so a chip never ranks by it; the overall rating is the measure those answers pivot to. */
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

/** Three verified-working queries, the generic last resort when nothing else in this file applies. */
export const SAFE_FALLBACK_SUGGESTIONS = [
  "Show me 5-star hospitals in Texas",
  "Best hospitals in Texas and California",
  "Tell me about Mayo Clinic",
] as const;

/** Bug 2 fix: a keyword in the question routes to a topic-relevant triple instead of always the same generic 3. */
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

/** A pivot-only peer-state list (not the state directory - see entity-provider.ts's STATES). Order matters: rotation picks the next entry after the current state. */
const PEER_STATE_CODES = ["TX", "CA", "FL", "NY"] as const;

/** Covers 5B-1 sub-labels too. Military is left out - it has no rating (D11). */
const OWNERSHIP_ROTATION = ["non-profit", "proprietary", "church-owned", "physician-owned", "government"] as const;

/** Neighbours for jurisdictions the fixed peer rotation above never offers (5B-5). */
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

/** 5B measures offered for a condition-less question, rotated and ordered by the answer's own metric family. */
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
  // A safety indicator or survey dimension is written in canonical form - the short "<alias> rate/score" form isn't answerable for all of them.
  if (metricId === "patient-safety-indicator" || metricId === "patient-experience") {
    return `Show me hospitals with ${rankedPhrase(metricId)} for ${concept.displayName}${scopeSuffix}`;
  }
  // Hip/knee's "mortality-rate" measure is actually its complication rate (COMP_HIP_KNEE), so never call it that.
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

/** `rankable: true` is a declaration, not proof a ranking template exists - some metrics (e.g. "Length of Stay") declare it but have none, so every chip built from them always failed dry-run. */
const ENABLED_TEMPLATE_IDS: ReadonlySet<string> = new Set(
  healthcareSqlTemplates.filter((template) => template.enabled !== false).map((template) => template.id),
);
const rankingTemplateSelector = new HealthcareTemplateSelector();

function hasRankingTemplate(metricId: string): boolean {
  return ENABLED_TEMPLATE_IDS.has(rankingTemplateSelector.select(metricId, "ranking"));
}

/** A one-hospital chip needs the metric's single-hospital template, which several metrics do not have (or have disabled). */
function hasLookupTemplate(metricId: string): boolean {
  return ENABLED_TEMPLATE_IDS.has(rankingTemplateSelector.select(metricId, "lookup"));
}

let hospitalIndex: { byId: Map<string, (typeof hospitalIdentityDirectory)[number]>; nameCounts: Map<string, number> } | undefined;

/** The hospital a one-hospital answer is about: named by the plan's own `hospital = <id>` filter, since a measure template's rows carry no name.
 * A name several hospitals share carries its place, or every chip built from it would come back as "which one do you mean". */
function activeHospital(
  facilityId: unknown,
  firstRow: Record<string, unknown> | undefined,
): { label: string; qualified: boolean } | undefined {
  hospitalIndex ??= {
    byId: new Map(hospitalIdentityDirectory.map((record) => [record.facilityId, record])),
    nameCounts: hospitalIdentityDirectory.reduce((counts, record) => counts.set(record.hospitalName, (counts.get(record.hospitalName) ?? 0) + 1), new Map<string, number>()),
  };
  const record = hospitalIndex.byId.get(String(facilityId));
  const name = typeof firstRow?.["hospital_name"] === "string" ? (firstRow["hospital_name"] as string) : record?.hospitalName;

  if (!name) {
    return undefined;
  }

  const shared = record !== undefined && (hospitalIndex.nameCounts.get(record.hospitalName) ?? 0) > 1;
  return shared ? { label: `${name} in ${record.city}, ${record.state}`, qualified: true } : { label: name, qualified: false };
}

/** The follow-up chip asking for another measure of the same hospital. */
const askAbout = (hospital: { label: string; qualified: boolean }, measure: string): string =>
  hospital.qualified ? `What is the ${measure} for ${hospital.label}?` : `What is ${hospital.label}'s ${measure}?`;

function filterValues(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).map(String);
}

/** Bug 2 fix: picks the NEXT comparable/rankable metric after the current one, wrapping around - not always the first alternate found. */
function nextComparableMetric(currentMetricId: string, requireRankingTemplate = false, requireLookupTemplate = false) {
  const pool = healthcareMetrics.filter(
    (metric) =>
      (metric.rankable || metric.comparable) &&
      (!requireRankingTemplate || hasRankingTemplate(metric.id)) &&
      (!requireLookupTemplate || hasLookupTemplate(metric.id)),
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

/** Every comparable/rankable metric OTHER than the current one, for a genuinely diverse pool (not just the one "next" pick). */
function allComparableMetricsExcept(currentMetricId: string) {
  return healthcareMetrics.filter(
    (metric) => (metric.rankable || metric.comparable) && metric.id !== currentMetricId,
  );
}

/** Success path: depth probe, breadth/pivot, and entity-dive candidates derived mechanically from the plan/rows - never invented. Deliberately generous; the caller's dry-run validates. */
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
  const hospital = hospitalFilter ? activeHospital(hospitalFilter.value, firstRow) : undefined;

  if (hospital) {
    const diveMetric = nextComparableMetric(plan.metric, false, true);
    if (diveMetric) {
      candidates.push(askAbout(hospital, diveMetric.displayName.toLowerCase()));
    }
  } else {
    // Depth probe: a different comparable/rankable metric, same scope.
    const alternateMetric = nextComparableMetric(measureMetricId(plan.metric), true);
    if (alternateMetric) {
      const scope = stateNames.length > 0 ? ` in ${stateNames.join(" and ")}` : "";
      candidates.push(`Show me hospitals with ${rankedPhrase(alternateMetric.id)}${scope}`);
    }

    // Breadth/pivot: ownership filter add/drop, rotating categories.
    const primaryMetricId = measureMetricId(plan.metric);
    if (ownershipFilter) {
      const scope = stateNames.length > 0 ? ` in ${stateNames.join(" and ")}` : "";
      candidates.push(`Show me hospitals with ${rankedPhrase(primaryMetricId)}${scope}`);
    } else {
      const ownershipPivot = OWNERSHIP_ROTATION[plan.metric.length % OWNERSHIP_ROTATION.length];
      candidates.push(`Show me ${ownershipPivot} hospitals with ${rankedPhrase(primaryMetricId)}`);
    }

    // Breadth/pivot: extend the state scope with a rotating peer state.
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

/** A larger mechanically-valid pool for the LLM to pick 3 diverse ones from, built the same way successPathSuggestions() is, just wider. */
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
  // Round 3: a concept-scoped query carries a `measureCode` filter, used to pivot the pool across OTHER concepts too, not just top-level metrics.
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
  const hospital = hospitalFilter ? activeHospital(hospitalFilter.value, firstRow) : undefined;

  // Batch 5A-1: pool is built one dimension at a time and interleaved, so the first three (the slow-model fallback) already differ in kind.
  const conceptItems: string[] = [];
  const ownershipItems: string[] = [];
  const peerItems: string[] = [];

  if (hospital) {
    for (const metric of allComparableMetricsExcept(plan.metric)) {
      if (!hasLookupTemplate(metric.id)) continue;
      pool.push(askAbout(hospital, metric.displayName.toLowerCase()));
    }
    pool.push(`Tell me about ${hospital.label}`);
  } else {
    // Phase 3.5: a listing/count/profile answer pivots on the overall rating (never "best Hospital List").
    const primaryMetricId = measureMetricId(plan.metric);
    const seed = rotationSeed(context.question);
    const attributeItems: string[] = [];

    // Depth probe: every OTHER comparable metric with a registered ranking template.
    for (const metric of allComparableMetricsExcept(primaryMetricId)) {
      if (!hasRankingTemplate(metric.id)) continue;
      pool.push(`Show me hospitals with ${rankedPhrase(metric.id)}${scopeSuffix}`);
    }

    // Depth probe, concept-scoped: siblings in the same family first, then one from each other family (rotated).
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

    // Breadth/pivot: ownership, rotated. Uses the concept's own short name when concept-scoped.
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

    // Breadth/pivot: several peer states. A jurisdiction with declared neighbours (PEER_JURISDICTIONS) uses those first.
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

    // Take one of each kind in turn, so a sibling measure leads the fallback-when-slow first three.
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

  // Batch 5A-1: the static triple used to be appended to EVERY pool. Now it only pads a too-small pool.
  if (pool.length < 3) {
    pool.push(...SAFE_FALLBACK_SUGGESTIONS);
  }

  return pool;
}

/**
 * Failure/recovery path. Identity-ambiguous candidates are CONTINUATION TOKENS (must exactly match what
 * matchClarificationResponse() expects - bare city name, or "city, state" on a collision), not standalone
 * questions (Bug 1 fix). Capability-unavailable reuses the same alternatives[] buildGuidanceMessage() renders.
 * Everything else routes through TOPIC_FALLBACKS by keyword, falling back to SAFE_FALLBACK_SUGGESTIONS.
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
    // Deliberately NOT combined with SAFE_FALLBACK_SUGGESTIONS - those aren't valid continuation tokens, and the caller trusts this list directly (skips dry-run).
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

/** How long Layer 2's optional LLM rephrasing can hold up a response before falling back to the deterministic list. Raised from the original 800ms proposal after live timing showed 823-1477ms. */
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
 * LLM Layer 2 (Contextual Suggestion Co-Pilot). The deterministic pool always runs first and IS the vocabulary
 * contract - the LLM only SELECTs + rephrases from it, never invents. Races against LLM_REPHRASE_RACE_TIMEOUT_MS;
 * on timeout/failure/malformed response, the deterministic top-3 is returned unchanged. Identity-ambiguous
 * candidates are never sent to the LLM - they're continuation tokens, not standalone questions.
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

  // Success path: a larger, diverse pool - the LLM SELECTS 3, never invents.
  if (context.success) {
    const pool = buildSuccessSuggestionPool(context);
    // Phase 3.5: a military (DoD) pool leads with its rated federal alternative, which a model's pick tends to skip - used as built.
    const military = context.executionPlan?.filters.some((filter) => filter.field === "ownership" && filter.value === "Department of Defense%");
    if (pool.length <= 3 || military) {
      return pool;
    }
    const selected = await raceWithTimeout(
      llmGateway.selectAndRephraseSuggestions(pool, { resolvedMetric, resolvedState }, 3, LLM_REPHRASE_RACE_TIMEOUT_MS, HEALTHCARE_PROMPT_WORDING),
      LLM_REPHRASE_RACE_TIMEOUT_MS,
    );
    // Fallback: the pool's first three, which interleaving makes differ in kind.
    if (!selected || selected.length !== 3) {
      return pool.slice(0, 3);
    }
    // Phase 3.5: a pick reworded into the opposite direction is dropped; the pool backfills below.
    const kept = selected.filter(chipKeepsDirection);

    // Batch 5A-1: the picks are followed by a scope-pivoting chip (if none of them pivots) and the rest of the pool as backfill.
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

    // Phase 3.5: backfill skips a chip whose measure a kept chip already names in other words.
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

  // Failure path: pool is already small/topic-specific - plain rephrasing, not selection.
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
