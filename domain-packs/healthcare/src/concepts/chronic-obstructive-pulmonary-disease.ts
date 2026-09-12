import type { ConceptDefinition } from "@intelligence/domain-sdk";

export const chronicObstructivePulmonaryDisease: ConceptDefinition = {
  id: "chronic-obstructive-pulmonary-disease",
  name: "chronic-obstructive-pulmonary-disease",
  displayName: "Chronic Obstructive Pulmonary Disease",
  description: "A chronic inflammatory lung disease causing obstructed airflow.",
  measureCodesByMetric: {
    "mortality-rate": "MORT_30_COPD",
    "readmission-rate": "READM-30-COPD-HRRP",
  },
};
