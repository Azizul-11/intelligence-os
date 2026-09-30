import type { EntityResolutionResult } from "./entity-resolution-result";

/** Universal contract for a domain's own phrase-to-entity-value resolution, e.g. "california" -> { entityId: "state", value: "CA" }. */
export interface EntityProvider {
  resolve(
    phrase: string,
  ): EntityResolutionResult;
}
