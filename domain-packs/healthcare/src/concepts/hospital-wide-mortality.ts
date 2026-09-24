import type { ConceptDefinition } from "@intelligence/domain-sdk";

// Batch 5B-1: Hybrid_HWM (Hybrid Hospital-Wide All-Cause Risk-Standardized Mortality Rate), lower is better,
// a different scale and reporting period from the condition-specific measures (see sql/hospital-condition-mortality-ranking.ts,
// reused unchanged). No readmission-rate mapping exists (no such warehouse measure), so "hospital wide readmission"
// stays refused - kept as an explicit pre-check topic in capability-catalog.ts.
export const hospitalWideMortality: ConceptDefinition = {
  id: "hospital-wide-mortality",
  name: "hospital-wide-mortality",
  displayName: "Hospital-Wide Mortality",
  description: "All-cause, hospital-wide risk-standardized mortality across all conditions, not one specific condition.",
  measureCodesByMetric: {
    "mortality-rate": "Hybrid_HWM",
  },
};
