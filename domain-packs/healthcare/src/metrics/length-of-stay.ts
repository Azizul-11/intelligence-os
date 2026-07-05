import type { MetricDefinition } from "@intelligence/domain-sdk";
import { utilizationCategory } from "./metric-categories";

export const lengthOfStayMetric: MetricDefinition = {
  id: "length-of-stay",

  name: "length-of-stay",

  displayName: "Length of Stay",

  description:
    "Average inpatient length of stay.",

  category: utilizationCategory,

  rankable: true,

  benchmarkable: true,

  aggregatable: true,
};