import type { AliasDefinition } from "@intelligence/domain-sdk";

// Batch 3: "complication(s)" maps to COMP_HIP_KNEE only together with a hip/knee word (exact literals); a bare alias would answer
// "pneumonia complications" with pneumonia MORTALITY (silent substitution).
const HIP_KNEE_TERMS = [
  "hip replacement",
  "knee replacement",
  "hip and knee replacement",
  "hip and knee",
  "total hip",
  "total knee",
  // V4 fix plan (Batch 3): the concept's CMS display name, written verbatim by the model, had no complication-rate alias and was refused.
  "elective primary hip knee arthroplasty",
];
const COMPLICATION_TERMS = ["complication", "complications", "complication rate", "complication rates"];
const HIP_KNEE_COMPLICATION_ALIASES = HIP_KNEE_TERMS.flatMap((joint) =>
  COMPLICATION_TERMS.flatMap((term) => [`${joint} ${term}`, `${term} for ${joint}`, `${term} after ${joint}`]),
);

export const mortalityRateAlias: AliasDefinition = {
  id: "mortality-rate",

  canonical: "mortality-rate",

  aliases: [
    "mortality",
    "mortality rate",
    "death rate",
    "hospital mortality",
    // Tier1 Task 1: plural forms - AliasResolver is exact-match only
    // (see packages/semantic/src/alias/alias-resolver.ts), so a plural
    // mention resolves only if explicitly registered here.
    "mortalities",
    "mortality rates",
    // Batch 3: "outcome(s)" is how a condition's result is usually asked for ("best pneumonia outcomes"); CMS's
    // outcome measure per condition is the 30-day mortality one. Moved here from the clinical-outcomes category
    // alias, which resolved the word but gave the planner no metric ("Unable to create query plan").
    // "survival" and "recovery" are deliberately NOT registered: they are higher-is-better words, and "highest
    // survival" would be read as a magnitude of the mortality rate (see MetricDefinition.lowerIsBetter).
    "outcome",
    "outcomes",
    ...HIP_KNEE_COMPLICATION_ALIASES,
  ],

  type: "metric",

  description:
    "Aliases for mortality rate.",
};
