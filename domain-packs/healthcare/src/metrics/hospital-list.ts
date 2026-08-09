import type { MetricDefinition } from "@intelligence/domain-sdk";
import { utilizationCategory } from "./metric-categories";

export const hospitalListMetric: MetricDefinition = {
  id: "hospital-list",

  name: "hospital-list",

  displayName: "Hospital List",

  description:
    "List of hospitals in a region.",

  category: utilizationCategory,

  rankable: false,

  benchmarkable: false,

  aggregatable: false,
};
