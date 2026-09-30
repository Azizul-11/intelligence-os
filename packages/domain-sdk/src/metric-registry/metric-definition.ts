/** A domain-declared metric: display info plus the capability flags (rankable, comparable, etc) Universal Core reads generically. */
import type { MetricCategory } from "./metric-category";
import type { MetricUnit } from "@intelligence/contracts";

export interface MetricDefinition {
  id: string;

  name: string;

  displayName: string;

  description?: string;

  unit?: MetricUnit;

  category?: MetricCategory;

  rankable?: boolean;

  benchmarkable?: boolean;

  aggregatable?: boolean;

  /** Batch 3 (D1): true when a LOWER value is better (mortality rate). Absent means higher is better - "highest death rate" flips to worst-first. */
  lowerIsBetter?: boolean;

  /** True when suitable for a metric-less multi-entity comparison ("Compare A and B"). Independent of rankable/benchmarkable/aggregatable. */
  comparable?: boolean;

  /** True when this is the domain's default metric for a scope-only ranking request ("non-profit hospitals", no metric named). At most one per domain. */
  defaultRankable?: boolean;
}