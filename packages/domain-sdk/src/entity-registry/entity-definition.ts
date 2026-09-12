import type { EntityCategory } from "./entity-category";
import type { EntityExecution } from "./entity-execution";

/**
 * Describes an entity exposed by a Domain Pack.
 */
export interface EntityDefinition {
  id: string;

  name: string;

  displayName: string;

  description?: string;

  category?: EntityCategory;

  /**
   * Optional execution metadata.
   *
   * The planner/runtime consumes this metadata without
   * knowing anything about the underlying domain.
   */
  execution?: EntityExecution;

  /**
   * True when this entity type identifies a single, specific real-world
   * record (e.g. Healthcare's "hospital" - a named facility), as opposed
   * to a scope/category filter (e.g. state, ownership) that narrows a
   * population without naming one specific record. Universal Core only
   * ever consumes this flag generically (see
   * QueryPlanner.discoverDefaultRankableMetric()) to avoid silently
   * reinterpreting a query that already names a specific record ("tell
   * me about Mayo Clinic") as a scope-only ranking request - the exact
   * entity-drop shape Tier0 Task 2 (F8) already closed elsewhere.
   */
  identifiesUniqueRecord?: boolean;
}