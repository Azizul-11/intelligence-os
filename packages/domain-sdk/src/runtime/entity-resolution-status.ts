/**
 * Outcome of resolving an entity mention to a domain identity.
 *
 * "unique"     - exactly one canonical identity was found.
 * "ambiguous"  - more than one candidate identity matched the mention;
 *                the caller must not silently pick one (see
 *                EntityResolutionResult.candidates).
 * "not_found"  - no identity could be determined at all.
 *
 * Optional and domain-agnostic - a Universal Core concept, not specific
 * to any entity type or domain.
 */
export type EntityResolutionStatus = "unique" | "ambiguous" | "not_found";
