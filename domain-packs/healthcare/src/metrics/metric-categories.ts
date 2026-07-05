import type { MetricCategory } from "@intelligence/domain-sdk";

export const qualityCategory: MetricCategory = {
  id: "quality",
  name: "Quality",
  description: "Measures overall healthcare quality.",
};

export const clinicalOutcomeCategory: MetricCategory = {
  id: "clinical-outcomes",
  name: "Clinical Outcomes",
  description: "Measures clinical performance and patient outcomes.",
};

export const utilizationCategory: MetricCategory = {
  id: "utilization",
  name: "Utilization",
  description: "Measures healthcare resource utilization.",
};

export const patientExperienceCategory: MetricCategory = {
  id: "patient-experience",
  name: "Patient Experience",
  description: "Measures patient satisfaction and experience.",
};