import type { MetricDefinition } from "@intelligence/domain-sdk";
import { utilizationCategory } from "./metric-categories";

export const hospitalDetailMetric: MetricDefinition = {
  id: "hospital-detail",

  name: "hospital-detail",

  displayName: "Hospital Detail",

  description:
    "General identity/profile information for a single hospital.",

  category: utilizationCategory,

  rankable: false,

  benchmarkable: false,

  aggregatable: false,
};
