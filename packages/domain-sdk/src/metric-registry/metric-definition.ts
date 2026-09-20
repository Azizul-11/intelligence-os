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

  /**
   * Batch 3 (D1): true when a LOWER value of this metric is the better one (a mortality rate, a readmission ratio).
   * The planner uses it to keep two kinds of ranking word apart: a performance word ("best", "worst") already says
   * which end is good, while a magnitude word ("highest", "lowest") names the number itself, so "highest death rate"
   * means the worst hospitals first. Optional: absent means higher is better, which is what every ranking word
   * already assumed.
   */
  lowerIsBetter?: boolean;

  /**
   * True when this metric is a genuine, deterministic per-entity value
   * that a Domain SDK explicitly considers suitable for a metric-less
   * multi-entity comparison ("Compare A and B", no metric named).
   * Independent of `rankable`/`benchmarkable`/`aggregatable` - a metric
   * can be rankable without being safely comparable (e.g. a metric
   * whose execution mechanism is incomplete or broken), and a Domain
   * SDK may in principle declare a metric comparable without also
   * making it rankable. Universal Core only ever reads this flag
   * generically; it has no knowledge of what any specific metric means.
   */
  comparable?: boolean;

  /**
   * True when this metric is the Domain's own declared "default" choice
   * for a ranking request that names a scope filter (e.g. a state,
   * ownership category, ...) but no metric at all - e.g. "non-profit
   * hospitals" with no metric named. Universal Core only ever consumes
   * this flag generically (see QueryPlanner.discoverDefaultRankableMetric());
   * it never guesses which metric a Domain considers its own default.
   * At most one metric should declare this per Domain - if more than
   * one does, QueryPlanner uses whichever `domainMetrics` lists first.
   */
  defaultRankable?: boolean;
}