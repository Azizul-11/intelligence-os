import type { EntityCandidate } from "./entity-candidate";
import type { EntityMatch } from "./entity-match";
import type { EntityResolutionContext } from "./entity-resolution-context";
import type { EntityResolutionResult } from "./entity-resolution-result";

/**
 * Contract for entity resolution.
 *
 * Implementations determine whether
 * multiple records represent the
 * same real-world entity.
 */
export interface EntityResolutionEngine {
  /**
   * Find possible candidates.
   */
  findCandidates(
    context: EntityResolutionContext,
  ): Promise<EntityCandidate[]>;

  /**
   * Score candidate matches.
   */
  scoreMatches(
    candidates: EntityCandidate[],
  ): Promise<EntityMatch[]>;

  /**
   * Resolve a dataset.
   */
  resolve(
    context: EntityResolutionContext,
  ): Promise<EntityResolutionResult>;

  /**
   * Resolve multiple datasets.
   */
  resolveBatch(
    contexts: EntityResolutionContext[],
  ): Promise<EntityResolutionResult[]>;
}