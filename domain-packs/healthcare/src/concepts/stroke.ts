import type { ConceptDefinition } from "@intelligence/domain-sdk";

export const stroke: ConceptDefinition = {
  id: "stroke",
  name: "stroke",
  displayName: "Stroke",
  description: "A medical condition caused by interrupted blood flow to the brain.",
  // Batch 5B-1: MORT_30_STK, lower is better. Only mortality-rate is mapped; "stroke readmission" stays refused (no warehouse measure; pre-check topic in capability-catalog.ts).
  measureCodesByMetric: {
    "mortality-rate": "MORT_30_STK",
  },
};