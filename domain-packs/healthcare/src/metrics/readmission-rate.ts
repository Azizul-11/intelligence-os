import type { MetricDefinition } from "@intelligence/domain-sdk";
import { clinicalOutcomeCategory } from "./metric-categories";

export const readmissionRateMetric: MetricDefinition = {
  id: "readmission-rate",

  name: "readmission-rate",

  displayName: "Readmission Rate",

  description:
    "Rate of patient readmissions after discharge.",

  category: clinicalOutcomeCategory,

  rankable: true,

  benchmarkable: true,

  aggregatable: true,

  comparable: true,
};