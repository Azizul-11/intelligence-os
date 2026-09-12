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

  // Tier0 Task 5 (F12 Sub-Task A): Healthcare's own default ranking
  // metric when a request names a scope filter (state, ownership, ...)
  // but no metric at all (e.g. "non-profit hospitals").
  defaultRankable: true,
};