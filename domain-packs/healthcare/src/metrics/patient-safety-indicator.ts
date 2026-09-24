import type { MetricDefinition } from "@intelligence/domain-sdk";
import { clinicalOutcomeCategory } from "./metric-categories";

// Batch 5B-2: the 11 individual AHRQ/CMS Patient Safety Indicators plus the PSI 90 composite (concepts/psi.ts).
// `comparable: false` is deliberate - `comparable: true` would add this metric to every metric-less multi-entity
// comparison (discoverComparableMetrics), which needs a "-by-facility-ids" template this batch does not build.
// `benchmarkable`/`aggregatable` are false for the same reason: no benchmark or group-aggregate template exists
// for it, so declaring the capability without the template behind it would be a dead end.
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
