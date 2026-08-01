import type { SemanticCollections } from "./semantic-collections";

import type { QueryFilter } from "./query-filter";
import type { QueryIntent } from "./query-intent";
import type { QueryLimit } from "./query-limit";
import type { QuerySort } from "./query-sort";

export interface QueryPlan {
  semantic: SemanticCollections;

  intent: QueryIntent;

  filters: QueryFilter[];

  sort?: QuerySort;

  limit?: QueryLimit;
}