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

  benchmarkable: true,

  aggregatable: true,
};