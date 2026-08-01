import type { QueryFilter } from "./query-filter";
import type { QueryLimit } from "./query-limit";
import type { QuerySort } from "./query-sort";
import type { QueryIntent } from "./query-intent";


export interface QueryPlan {
  metricId: string | null;
  
  intent: QueryIntent;

  dimensions: string[];

  filters: QueryFilter[];

  sort?: QuerySort;

  limit?: QueryLimit;
}