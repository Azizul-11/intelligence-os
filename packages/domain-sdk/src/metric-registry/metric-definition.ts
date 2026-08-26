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
}