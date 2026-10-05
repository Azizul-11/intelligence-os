import type { AliasDefinition } from "@intelligence/domain-sdk";

export const acuteMyocardialInfarctionAlias: AliasDefinition = {
  id: "acute-myocardial-infarction",

  // canonical: "Acute Myocardial Infarction",
  canonical: "acute-myocardial-infarction",

  aliases: [
    "AMI",
    "Heart Attack",
    "Acute Myocardial Infarction",
    // Tier1 Task 1: plural form; without it "heart attacks" never resolves and the AMI filter is silently dropped.
    "Heart Attacks",
  ],

 type: "concept",

  description:
    "Canonical healthcare term representing Acute Myocardial Infarction.",
};