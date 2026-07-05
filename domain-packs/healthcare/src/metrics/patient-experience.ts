import type { MetricDefinition } from "@intelligence/domain-sdk";
import { patientExperienceCategory } from "./metric-categories";

export const patientExperienceMetric: MetricDefinition = {
  id: "patient-experience",

  name: "patient-experience",

  displayName: "Patient Experience",

  description:
    "Patient satisfaction and experience survey score.",

  category: patientExperienceCategory,

  rankable: true,

  benchmarkable: true,

  aggregatable: true,
};