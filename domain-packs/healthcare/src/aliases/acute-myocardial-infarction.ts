import type { AliasDefinition } from "@intelligence/domain-sdk";

export const acuteMyocardialInfarctionAlias: AliasDefinition = {
  id: "acute-myocardial-infarction",

  canonical: "Acute Myocardial Infarction",

  aliases: [
    "AMI",
    "Heart Attack",
    "Acute Myocardial Infarction",
  ],

  type: "entity",

  description:
    "Canonical healthcare term representing Acute Myocardial Infarction.",
};