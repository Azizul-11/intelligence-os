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
};