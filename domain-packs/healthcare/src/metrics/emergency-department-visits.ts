import type { MetricDefinition } from "@intelligence/domain-sdk";
import { utilizationCategory } from "./metric-categories";

export const emergencyDepartmentVisitsMetric: MetricDefinition = {
  id: "emergency-department-visits",

  name: "emergency-department-visits",

  displayName: "Emergency Department Visits",

  description:
    "Volume of emergency department visits.",

  category: utilizationCategory,

  rankable: true,

  benchmarkable: true,

  aggregatable: true,
};