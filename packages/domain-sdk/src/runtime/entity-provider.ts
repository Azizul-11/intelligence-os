import type { EntityResolutionResult } from "./entity-resolution-result";

/**
 * Universal contract for domain-provided entity resolution.
 *
 * Domain implementations provide this to resolve query phrases
 * to concrete entity values without coupling to the semantic engine.
 *
 * Examples:
 * - Healthcare: "california" → { entityId: "state", value: "CA" }
 * - Finance: "Q4 2023" → { entityId: "fiscal-quarter", value: "2023-Q4" }
 * - Retail: "North Region" → { entityId: "region", value: "NORTH" }
 */
export interface EntityProvider {
  /**
   * Resolve a phrase to an entity value.
   *
   * @param phrase - Natural language phrase from user query
   * @returns Resolution result with entity type and value
   */
  resolve(
    phrase: string,
  ): EntityResolutionResult;
}
