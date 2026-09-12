import type { SuggestionContext } from "@intelligence/domain-sdk";

import { healthcareMetrics } from "../metrics";
import { STATE_NAMES_BY_CODE } from "./execution-strategy";

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
      "Show me hospitals with best Mortality Rate",
    ],
  },
  {
    keywords: ["mortality", "death", "deaths"],
    suggestions: [
      "Show me hospitals with best Mortality Rate",
      "Show me hospitals with best Hospital Overall Rating",
      "Show me non-profit hospitals with best AMI mortality",
    ],
  },
  {
    keywords: ["readmission", "readmissions"],
    suggestions: [
      "Show me hospitals with best Readmission Rate",
      "Show me hospitals with best Hospital Overall Rating",
      "Show me hospitals with best Mortality Rate",
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

const OWNERSHIP_ROTATION = ["non-profit", "proprietary"] as const;

function stateName(code: string): string {
  return STATE_NAMES_BY_CODE.get(code) ?? code;
}

function metricDisplayName(metricId: string): string | undefined {
  return healthcareMetrics.find((metric) => metric.id === metricId)?.displayName;
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
function nextComparableMetric(currentMetricId: string) {
  const pool = healthcareMetrics.filter((metric) => metric.rankable || metric.comparable);
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
    const alternateMetric = nextComparableMetric(plan.metric);
    if (alternateMetric) {
      const scope = stateNames.length > 0 ? ` in ${stateNames.join(" and ")}` : "";
      candidates.push(`Show me hospitals with best ${alternateMetric.displayName}${scope}`);
    }

    // Breadth/pivot: mechanical ownership filter add/drop, same metric -
    // rotates between ownership categories instead of always "non-profit".
    const primaryDisplayName = metricDisplayName(plan.metric) ?? "overall rating";
    if (ownershipFilter) {
      const scope = stateNames.length > 0 ? ` in ${stateNames.join(" and ")}` : "";
      candidates.push(`Show me hospitals with best ${primaryDisplayName}${scope}`);
    } else {
      const ownershipPivot = OWNERSHIP_ROTATION[plan.metric.length % OWNERSHIP_ROTATION.length];
      candidates.push(`Show me ${ownershipPivot} hospitals with best ${primaryDisplayName}`);
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
    for (const entry of parsed.slice(0, 3)) {
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

  const candidates: string[] = [];

  if (answerability?.reason === "capability-unavailable" && answerability.alternatives) {
    for (const alternative of answerability.alternatives.slice(0, 3)) {
      const displayName = metricDisplayName(alternative.capabilityId);
      if (displayName) {
        candidates.push(`Show me hospitals with best ${displayName}`);
      }
    }
    candidates.push(...SAFE_FALLBACK_SUGGESTIONS);
    return candidates;
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
