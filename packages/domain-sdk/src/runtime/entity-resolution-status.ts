/** Outcome of resolving an entity mention: exactly one match, 2+ candidates (see .candidates, never silently picked), or none. */
export type EntityResolutionStatus = "unique" | "ambiguous" | "not_found";
