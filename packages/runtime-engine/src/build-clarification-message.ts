import type {
  EntityResolutionResult,
  AmbiguousCandidate,
} from "@intelligence/semantic";

/**
 * Phase 8.3: deterministic, contract-driven targeted clarification
 * message construction. No LLM, no NLP, no semantic guessing - only
 * string interpolation over data the Domain SDK already supplied on
 * `SemanticResolutionResult.identityAmbiguities` (Phase 8.1).
 *
 * Universal Core never interprets what a candidate's `label` means; it
 * only displays it verbatim when present, falling back to the raw
 * opaque value for a Domain SDK that has not adopted the
 * `AmbiguousCandidate` shape (backward-compatible, never crashes).
 */

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
