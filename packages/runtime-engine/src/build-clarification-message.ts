import type {
  EntityResolutionResult,
  AmbiguousCandidate,
} from "@intelligence/semantic";

/** Phase 8.3: deterministic clarification message from `identityAmbiguities` (Phase 8.1); no LLM/NLP. Core never interprets a candidate `label`, shows it verbatim or falls back to the raw opaque value. */

function isAmbiguousCandidate(value: unknown): value is AmbiguousCandidate {
  return typeof value === "object" && value !== null && "value" in value;
}

function candidateLabel(candidate: unknown): string {
  if (isAmbiguousCandidate(candidate)) {
    return typeof candidate.label === "string"
      ? candidate.label
      : String(candidate.value);
  }

  return String(candidate);
}

export function buildClarificationMessage(
  identityAmbiguities: readonly EntityResolutionResult[],
): string {
  const clauses = identityAmbiguities.map((ambiguity) => {
    const subject =
      ambiguity.phrase && ambiguity.phrase.length > 0
        ? ambiguity.phrase
        : "entity";

    const labels = (ambiguity.candidates ?? []).map(candidateLabel);

    return `Which ${subject} do you mean — ${labels.join(" or ")}?`;
  });

  return clauses.join(" ");
}
