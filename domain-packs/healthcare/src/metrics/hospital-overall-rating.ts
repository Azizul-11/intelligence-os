import type { MetricDefinition } from "@intelligence/domain-sdk";
import { qualityCategory } from "./metric-categories";

export const hospitalOverallRatingMetric: MetricDefinition = {
  id: "hospital-overall-rating",

  name: "hospital-overall-rating",

  displayName: "Hospital Overall Rating",

  description:
    "Overall CMS quality rating assigned to a hospital.",

  category: qualityCategory,

  rankable: true,

  benchmarkable: true,

  aggregatable: false,

  comparable: true,

  // Tier0 Task 5 (F12 Sub-Task A): default ranking metric when a scope filter (state, ownership, ...) is named without a metric.
  defaultRankable: true,
};