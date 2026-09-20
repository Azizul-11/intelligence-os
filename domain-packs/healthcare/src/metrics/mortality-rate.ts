import type { MetricDefinition } from "@intelligence/domain-sdk";
import { clinicalOutcomeCategory } from "./metric-categories";

export const mortalityRateMetric: MetricDefinition = {
  id: "mortality-rate",

  name: "mortality-rate",

  displayName: "Mortality Rate",

  description:
    "Observed mortality rate for selected clinical conditions.",

  category: clinicalOutcomeCategory,

  rankable: true,

  // Batch 3 (D1): a lower mortality rate is the better one; "highest death rate" means the worst hospitals first.
  lowerIsBetter: true,

  benchmarkable: true,

  aggregatable: true,

  comparable: true,
};