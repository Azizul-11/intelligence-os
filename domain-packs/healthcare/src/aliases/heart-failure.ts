import type { AliasDefinition } from "@intelligence/domain-sdk";

export const heartFailureAlias: AliasDefinition = {
  id: "heart-failure",

  canonical: "heart-failure",

  aliases: [
    "Heart Failure",
    "HF",
    "Congestive Heart Failure",
    "CHF",
    // Tier1 Task 1: plural form - same concept-loss risk as AMI's own
    // "Heart Attacks" gap (see acute-myocardial-infarction.ts).
    "Heart Failures",
  ],

  type: "concept",

  description:
    "Canonical healthcare term representing Heart Failure.",
};
