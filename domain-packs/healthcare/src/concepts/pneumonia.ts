import type { ConceptDefinition } from "@intelligence/domain-sdk";

export const pneumonia: ConceptDefinition = {
  id: "pneumonia",
  name: "pneumonia",
  displayName: "Pneumonia",
  description: "An infection that inflames the air sacs in one or both lungs.",
  measureCodesByMetric: {
    "mortality-rate": "MORT_30_PN",
    "readmission-rate": "READM-30-PN-HRRP",
  },
};
