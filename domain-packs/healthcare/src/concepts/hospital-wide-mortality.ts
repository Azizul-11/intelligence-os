import type { ConceptDefinition } from "@intelligence/domain-sdk";

// Batch 5B-1: Hybrid_HWM, lower is better, different scale/period from condition measures. No readmission measure exists, so "hospital wide readmission"
// stays refused (pre-check topic in capability-catalog.ts).
export const hospitalWideMortality: ConceptDefinition = {
  id: "hospital-wide-mortality",
  name: "hospital-wide-mortality",
  displayName: "Hospital-Wide Mortality",
  description: "All-cause, hospital-wide risk-standardized mortality across all conditions, not one specific condition.",
  measureCodesByMetric: {
    "mortality-rate": "Hybrid_HWM",
  },
};
