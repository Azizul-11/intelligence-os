import type { AnswerabilityResult } from "@intelligence/contracts";
import type { MetricDefinition } from "@intelligence/domain-sdk";

/** Phase 8.10 Layer 1: deterministic capability-unavailable guidance message; no LLM/NLP/ranking, only interpolation of `MetricDefinition.displayName`/`.description`.
 * Core never judges which alternative is "better"; presents Phase 8.9's alternatives with Domain-owned labels verbatim (same pattern as `buildClarificationMessage()`). */

function resolveMetricLabel(
  capabilityId: string,
  metrics: readonly MetricDefinition[],
): string | null {
  const metric = metrics.find((m) => m.id === capabilityId);

  if (!metric) {
    // Fail closed: skip an alternative with no matching MetricDefinition rather than fabricate a label (should never happen if Phase 8.9 is correct).
    return null;
  }

  return metric.displayName;
}

export function buildGuidanceMessage(
  answerability: AnswerabilityResult,
  metrics: readonly MetricDefinition[],
): string | null {
  // Phase 8.10 Layer 1 guidance runs only for capability-unavailable with discovered alternatives;
  // every other answerability state has its own shipped boundary or is deferred (data-unavailable alternatives, per the Remaining Gaps Audit).
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

  // No valid alternative label resolved: return null (no truthful guidance possible); the existing error message stays as-is.
  if (labels.length === 0) {
    return null;
  }

  // Deterministic list rendering (Oxford comma for 3+); framing must not imply the capability is coming or that alternatives are "better".
  const alternativesList =
    labels.length === 1
      ? labels[0]
      : labels.length === 2
        ? `${labels[0]} or ${labels[1]}`
        : `${labels.slice(0, -1).join(", ")}, or ${labels[labels.length - 1]}`;

  return `I can't answer this using the requested capability because it isn't currently available. I can help with ${alternativesList} instead.`;
}
