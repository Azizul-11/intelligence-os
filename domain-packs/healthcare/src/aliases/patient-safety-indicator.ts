import type { AliasDefinition } from "@intelligence/domain-sdk";

// Batch 5B-2: composite "<condition> rate(s)" metric aliases overlap the concept aliases (psi.ts, sepsis.ts), registered under the METRIC, never folded into
// concept text, so both stay separate candidates for measureCodesByMetric. Keep in step with registered concept aliases or they are dead weight.
const PSI_CONDITION_TERMS = [
  "pressure ulcer",
  "pressure ulcers",
  "death after serious surgical complication",
  "failure to rescue",
  "iatrogenic pneumothorax",
  "postoperative sepsis",
  "in-hospital fall with fracture",
  "in-hospital falls with fracture",
  "postoperative hemorrhage",
  "postoperative acute kidney injury",
  "kidney injury requiring dialysis",
  "postoperative respiratory failure",
  "perioperative blood clot",
  "blood clots after surgery",
  "postoperative wound dehiscence",
  "accidental puncture",
  "accidental puncture or laceration",
];
const RATE_TERMS = ["rate", "rates"];
const PSI_RATE_ALIASES = PSI_CONDITION_TERMS.flatMap((term) => RATE_TERMS.map((rate) => `${term} ${rate}`));

export const patientSafetyIndicatorAlias: AliasDefinition = {
  id: "patient-safety-indicator",

  canonical: "patient-safety-indicator",

  // Bare "psi" is deliberately NOT registered here (an earlier draft had it): "PSI 90" (the concept alias) plus bare
  // "psi" (the metric alias) both matching inside "Which hospitals have the highest PSI 90 patient safety scores?"
  // (a real catalog row) let the query planner ALSO pick up the pre-existing "safety scores" alias
  // (safety-performance.ts) as a second metric, and "highest" ended up applied to that second metric's direction,
  // not PSI 90's - confirmed live, a silently wrong (best-first, not worst-first) answer. "psi 90 composite" and
  // "patient safety composite" below give the formal, deterministic path everything it needs without the bare
  // word; "patient safety indicator(s)"/bare "psi" alone (A113, D2) are handled by the lay-vocabulary group instead
  // (runtime/lay-vocabulary.ts "psi-bare"), which runs before this alias list is ever consulted and needs no metric
  // alias of its own. A119's own exact wording now resolves through the live model instead (proven correct live,
  // the same "sepsis rate"-shape D1/D2 wording already sometimes needs - see the batch's own report).
  aliases: [
    "patient safety indicator",
    "patient safety indicators",
    "safety indicator",
    "safety indicators",
    // "psi 90 composite" is a strict superset of the concept's own "PSI 90" alias (the hip/knee overlap pattern);
    // "Patient Safety Composite" is deliberately NOT also listed here identically to its own concept alias - an
    // exact-duplicate metric+concept alias confused the resolver (the D2 lay-group rewrite to "... for Patient
    // Safety Composite" stopped finding a template), so the concept alias alone is enough for it.
    "psi 90 composite",
    ...PSI_RATE_ALIASES,
  ],

  type: "metric",

  description:
    "Aliases for the Patient Safety Indicator metric.",
};
