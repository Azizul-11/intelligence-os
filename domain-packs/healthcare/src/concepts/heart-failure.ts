import type { ConceptDefinition } from "@intelligence/domain-sdk";

export const heartFailure: ConceptDefinition = {
  id: "heart-failure",
  name: "heart-failure",
  displayName: "Heart Failure",
  description: "A chronic condition in which the heart cannot pump blood effectively.",
  measureCodesByMetric: {
    "mortality-rate": "MORT_30_HF",
    "readmission-rate": "READM-30-HF-HRRP",
  },
};
