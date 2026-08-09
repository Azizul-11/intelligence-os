import type { MetricDefinition } from "@intelligence/domain-sdk";
import { utilizationCategory } from "./metric-categories";

export const hospitalCountMetric: MetricDefinition = {
  id: "hospital-count",

  name: "hospital-count",

  displayName: "Hospital Count",

  description:
    "Count of hospitals in a region.",

  category: utilizationCategory,

  rankable: false,

  benchmarkable: false,

  aggregatable: true,
};
