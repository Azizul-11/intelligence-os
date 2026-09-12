import type { ConceptDefinition } from "@intelligence/domain-sdk";

export const coronaryArteryBypassGraft: ConceptDefinition = {
  id: "coronary-artery-bypass-graft",
  name: "coronary-artery-bypass-graft",
  displayName: "Coronary Artery Bypass Graft",
  description: "Heart bypass surgery to restore blood flow to the heart.",
  measureCodesByMetric: {
    "mortality-rate": "MORT_30_CABG",
    "readmission-rate": "READM-30-CABG-HRRP",
  },
};
