import type { MetricDefinition } from "@intelligence/domain-sdk";
import { clinicalOutcomeCategory } from "./metric-categories";

// Batch 5B-2: 11 PSIs plus PSI 90 (concepts/psi.ts). `comparable`, `benchmarkable` and `aggregatable` are false on purpose: the
// "-by-facility-ids", benchmark and group-aggregate templates do not exist, so declaring them would be a dead end.
export const patientSafetyIndicatorMetric: MetricDefinition = {
  id: "patient-safety-indicator",

  name: "patient-safety-indicator",

  displayName: "Patient Safety Indicator",

  description:
    "AHRQ/CMS patient safety indicator rates: in-hospital complications such as pressure ulcers, postoperative sepsis and accidental punctures.",

  category: clinicalOutcomeCategory,

  rankable: true,

  // every PSI is a complication or death rate: lower is always better.
  lowerIsBetter: true,

  benchmarkable: false,

  aggregatable: false,

  comparable: false,
};
