import type { ConceptDefinition } from "@intelligence/domain-sdk";

export const stroke: ConceptDefinition = {
  id: "stroke",
  name: "stroke",
  displayName: "Stroke",
  description: "A medical condition caused by interrupted blood flow to the brain.",
  // Batch 5B-1: MORT_30_STK (30-day risk-standardized stroke mortality, lower is better). Only mortality-rate is
  // mapped - the warehouse has no stroke readmission measure, so "stroke readmission" stays refused (the concept
  // resolves but no measureCode filter is built for readmission-rate, and it is also an explicit pre-check topic
  // with its own guidance chips - see capability-catalog.ts and lay-vocabulary.ts SCOPE_GUIDANCE).
  measureCodesByMetric: {
    "mortality-rate": "MORT_30_STK",
  },
};