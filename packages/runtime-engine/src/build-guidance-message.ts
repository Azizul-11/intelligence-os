import type { AnswerabilityResult } from "@intelligence/contracts";
import type { MetricDefinition } from "@intelligence/domain-sdk";

/**
 * Phase 8.10 Layer 1: deterministic, contract-driven capability-
 * unavailable guidance message construction. No LLM, no NLP, no
 * semantic guessing, no recommendation ranking - only string
 * interpolation over data the Domain SDK already supplied on
 * `MetricDefinition.displayName` / `.description`.
 *
 * Universal Core never interprets what a metric means or decides which
 * alternative is "better"; it only presents the alternatives already
 * discovered by Phase 8.9's deterministic filter-compatibility check,
 * displaying each alternative's Domain-owned label verbatim.
 *
 * Reuses the same pure-rendering pattern as Phase 8.3's
 * `buildClarificationMessage()` - a second use case of the same
 * architectural principle: structured deterministic evidence +
 * Domain-owned labels → truthful message, no authority beyond what the
 * structured inputs already prove.
 */

function resolveMetricLabel(
  capabilityId: string,
  metrics: readonly MetricDefinition[],
): string | null {
  const metric = metrics.find((m) => m.id === capabilityId);

  if (!metric) {
    // Fail closed: if the alternative capabilityId has no matching
    // MetricDefinition, skip it rather than fabricating a label. This
    // should never happen if Phase 8.9's discoverAlternatives() is
    // correct (it only returns metric ids that exist), but explicit
    // safety here prevents hallucinated capabilities from ever reaching
    // user-visible text.
    return null;
  }

  return metric.displayName;
}

export function buildGuidanceMessage(
  answerability: AnswerabilityResult,
  metrics: readonly MetricDefinition[],
): string | null {
  // Phase 8.10 Layer 1 guidance runs only for capability-unavailable
  // with discovered alternatives. Every other answerability state
  // (identity-ambiguous, data-unavailable, semantic-incomplete,
  // candidate-inconsistent, plan-incomplete) must not trigger this
  // renderer - they have their own already-shipped boundaries or are
  // deliberately deferred work (data-unavailable alternatives, per the
  // Remaining Gaps Audit).
  if (
    answerability.status !== "not_directly_answerable" ||
    answerability.reason !== "capability-unavailable" ||
    !answerability.alternatives ||
    answerability.alternatives.length === 0
  ) {
    return null;
  }

  const labels: string[] = [];

  for (const alternative of answerability.alternatives) {
    const label = resolveMetricLabel(alternative.capabilityId, metrics);
    if (label !== null) {
      labels.push(label);
    }
  }

  // If no valid alternative label was resolved, return null - no
  // guidance can be built without at least one truthful alternative.
  // The existing error message (e.g. "SQL template not found.") will
  // remain as-is.
  if (labels.length === 0) {
    return null;
  }

  // Deterministic rendering: structured list of alternatives, Oxford
  // comma convention for 3+, truthful framing that does not imply the
  // unavailable capability will be available soon or that the
  // alternatives are "better" - only that they are currently supported.
  const alternativesList =
    labels.length === 1
      ? labels[0]
      : labels.length === 2
        ? `${labels[0]} or ${labels[1]}`
        : `${labels.slice(0, -1).join(", ")}, or ${labels[labels.length - 1]}`;

  return `I can't answer this using the requested capability because it isn't currently available. I can help with ${alternativesList} instead.`;
}
