/**
 * Phase 8.3: the smallest additive, generic representation of one
 * candidate identity in an ambiguous `EntityResolutionResult.candidates`
 * list.
 *
 * `value` is the opaque canonical identity (re-submitted unchanged once
 * the user disambiguates - Universal Core never inspects it). `label` is
 * optional, Domain-supplied, human-readable text distinguishing this
 * candidate from the others in the same ambiguous set (e.g. Healthcare
 * might supply "Winfield, Alabama"); Universal Core only ever displays
 * it verbatim, never interprets its content.
 *
 * A Domain SDK that has not adopted this shape may continue returning
 * bare opaque values in `candidates` - Universal Core's clarification
 * message construction falls back to displaying the raw value in that
 * case (see `packages/runtime-engine/src/build-clarification-message.ts`).
 */
export interface AmbiguousCandidate {
  value: unknown;

  label?: string;
}
