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
}