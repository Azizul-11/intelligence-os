import type { ConceptDefinition } from "@intelligence/domain-sdk";

export const acuteMyocardialInfarction: ConceptDefinition = {
  id: "acute-myocardial-infarction",
  name: "acute-myocardial-infarction",
  displayName: "Acute Myocardial Infarction",
  description: "Commonly known as a heart attack.",
  // Tier0 Task 5 (F12 Sub-Task B): CMS per-condition measure codes,
  // confirmed live in warehouse_hospital_clinical_outcomes/_readmissions.
  measureCodesByMetric: {
    "mortality-rate": "MORT_30_AMI",
    "readmission-rate": "READM-30-AMI-HRRP",
  },
};