import type { ConceptDefinition } from "@intelligence/domain-sdk";

export const electivePrimaryThaTka: ConceptDefinition = {
  id: "elective-primary-tha-tka",
  name: "elective-primary-tha-tka",
  displayName: "Elective Primary Hip/Knee Arthroplasty",
  description: "Elective primary total hip or knee replacement surgery.",
  measureCodesByMetric: {
    "mortality-rate": "COMP_HIP_KNEE",
    "readmission-rate": "READM-30-HIP-KNEE-HRRP",
  },
};
