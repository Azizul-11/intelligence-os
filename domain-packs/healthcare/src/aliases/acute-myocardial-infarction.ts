import type { AliasDefinition } from "@intelligence/domain-sdk";

export const acuteMyocardialInfarctionAlias: AliasDefinition = {
  id: "acute-myocardial-infarction",

  // canonical: "Acute Myocardial Infarction",
  canonical: "acute-myocardial-infarction",

  aliases: [
    "AMI",
    "Heart Attack",
    "Acute Myocardial Infarction",
  ],

 type: "concept",

  description:
    "Canonical healthcare term representing Acute Myocardial Infarction.",
};