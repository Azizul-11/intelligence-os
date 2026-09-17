import type { SuggestionContext } from "@intelligence/domain-sdk";
import { llmGateway } from "@intelligence/llm-model-gateway";

import { healthcareMetrics } from "../metrics";
import { concepts } from "../concepts";
import { healthcareAliases } from "../aliases";
import { STATE_NAMES_BY_CODE } from "./execution-strategy";

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
};

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
function buildSuccessSuggestionPool(context: SuggestionContext): string[] {
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

  if (hospitalName) {
    for (const metric of allComparableMetricsExcept(plan.metric)) {
      pool.push(`What is ${hospitalName}'s ${metric.displayName.toLowerCase()}?`);
    }
    pool.push(`Tell me about ${hospitalName}`);
  } else {
    // Depth probe: every OTHER comparable metric, not just the next one.
    for (const metric of allComparableMetricsExcept(plan.metric)) {
      pool.push(`Show me hospitals with best ${metric.displayName}${scopeSuffix}`);
    }

    // Depth probe (concept-scoped only): every OTHER clinical concept
    // with a real measure code - "heart attack" pivots to "bypass
    // surgery"/"heart failure"/"pneumonia"/etc, not only to unrelated
    // top-level metrics.
    if (currentConcept) {
      for (const other of CONCEPTS_WITH_REAL_MEASURES) {
        if (other.id === currentConcept.id) continue;
        const otherMetricId = other.measureCodesByMetric?.[plan.metric] ? plan.metric : Object.keys(other.measureCodesByMetric ?? {})[0];
        if (!otherMetricId) continue;
        const otherWord = METRIC_WORDS_BY_ID[otherMetricId] ?? "rate";
        const shortName = conceptAliases(other.id)[0] ?? other.displayName;
        pool.push(`Show me hospitals with lowest ${shortName} ${otherWord}${scopeSuffix}`);
      }
    }

    // Breadth/pivot: both ownership directions, not just one rotation
    // step - uses the current CONCEPT's own short name + metric word
    // when concept-scoped (e.g. "AMI mortality rate"), not the generic
    // top-level metric name, so the pivot stays contextual.
    const primaryDisplayName = currentConcept
      ? `${conceptAliases(currentConcept.id)[0] ?? currentConcept.displayName} ${METRIC_WORDS_BY_ID[plan.metric] ?? ""}`.trim()
      : metricDisplayName(plan.metric) ?? "overall rating";
    if (ownershipFilter) {
      pool.push(`Show me hospitals with best ${primaryDisplayName}${scopeSuffix}`);
    } else {
      for (const ownership of OWNERSHIP_ROTATION) {
        pool.push(`Show me ${ownership} hospitals with best ${primaryDisplayName}`);
      }
    }

    // Breadth/pivot: several peer states, not just the next rotation step.
    if (stateValues.length >= 1) {
      const peers: string[] = [];
      let anchor = stateValues;
      for (let i = 0; i < Math.min(3, PEER_STATE_CODES.length); i++) {
        const peer = nextPeerState(anchor);
        if (!peer || peers.includes(peer)) {
          break;
        }
        peers.push(peer);
        anchor = [...anchor, peer];
      }
      for (const peer of peers) {
        pool.push(
          stateValues.length === 1
            ? `Best hospitals in ${stateNames[0]} and ${stateName(peer)}`
            : `Show me 5-star hospitals in ${stateNames.join(", ")} and ${stateName(peer)}`,
        );
      }
    }
  }

  pool.push(...SAFE_FALLBACK_SUGGESTIONS);
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
const LLM_REPHRASE_RACE_TIMEOUT_MS = 1800;

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

  const resolvedMetric = context.executionPlan?.metric;
  const stateFilterValue = context.executionPlan?.filters.find((filter) => filter.field === "state")?.value;
  const resolvedState = stateFilterValue !== undefined ? String(stateFilterValue) : undefined;

  // Success path: a genuinely larger, diverse pool - the LLM SELECTS 3
  // (never invents), so different turns asking the same base question
  // can surface different real facts, not just different wording of
  // the same 3.
  if (context.success) {
    const pool = buildSuccessSuggestionPool(context);
    if (pool.length <= 3) {
      return pool;
    }
    const selected = await raceWithTimeout(
      llmGateway.selectAndRephraseSuggestions(pool, { resolvedMetric, resolvedState }, 3),
      LLM_REPHRASE_RACE_TIMEOUT_MS,
    );
    return selected && selected.length === 3 ? selected : deterministic.slice(0, 3);
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
    llmGateway.synthesizeSuggestions({
      question: context.question,
      resolvedMetric,
      resolvedState,
      candidates: toRephrase,
    }),
    LLM_REPHRASE_RACE_TIMEOUT_MS,
  );

  if (!rephrased || rephrased.length !== toRephrase.length) {
    return deterministic;
  }

  return [...rephrased, ...deterministic.slice(3)];
}
