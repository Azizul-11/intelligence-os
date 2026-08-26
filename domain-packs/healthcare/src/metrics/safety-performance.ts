import type { MetricDefinition } from "@intelligence/domain-sdk";
import { clinicalOutcomeCategory } from "./metric-categories";

export const safetyPerformanceMetric: MetricDefinition = {
  id: "safety-performance",

  name: "safety-performance",

  displayName: "Safety Performance",

  description:
    "Hospital safety performance measured by facility safety measures and outcomes.",

  category: clinicalOutcomeCategory,

  rankable: true,

  benchmarkable: true,

  aggregatable: false,

  comparable: true,
};
