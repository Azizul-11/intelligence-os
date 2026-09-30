/** Describes an entity exposed by a Domain Pack. */
import type { EntityCategory } from "./entity-category";
import type { EntityExecution } from "./entity-execution";

export interface EntityDefinition {
  id: string;

  name: string;

  displayName: string;

  description?: string;

  category?: EntityCategory;

  /** Optional execution metadata, consumed generically by the planner/runtime. */
  execution?: EntityExecution;

  /** True when this entity identifies one specific record (e.g. a named hospital), not a scope filter (state, ownership). */
  identifiesUniqueRecord?: boolean;
}