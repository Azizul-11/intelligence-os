import type { QueryFilter } from "./query-filter";
import type { QueryLimit } from "./query-limit";
import type { QuerySort } from "./query-sort";

export interface QueryPlan {
  metricId: string | null;

  dimensions: string[];

  filters: QueryFilter[];

  sort?: QuerySort;

  limit?: QueryLimit;
}