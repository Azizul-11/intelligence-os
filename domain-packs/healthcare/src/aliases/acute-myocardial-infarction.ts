import type { AliasDefinition } from "@intelligence/domain-sdk";

export const acuteMyocardialInfarctionAlias: AliasDefinition = {
  id: "acute-myocardial-infarction",

  // canonical: "Acute Myocardial Infarction",
  canonical: "acute-myocardial-infarction",

  aliases: [
    "AMI",
    "Heart Attack",
    "Acute Myocardial Infarction",
    // Tier1 Task 1: plural form - without this, "heart attacks" never
    // resolves as a concept candidate at all, silently dropping the AMI
    // condition filter instead of failing (a concept-loss regression,
    // not a clean refusal - see TIER1_T1_PLURAL_ALIASES_AUDIT.md).
    "Heart Attacks",
  ],

 type: "concept",

  description:
    "Canonical healthcare term representing Acute Myocardial Infarction.",
};