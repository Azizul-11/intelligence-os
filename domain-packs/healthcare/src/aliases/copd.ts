import type { AliasDefinition } from "@intelligence/domain-sdk";

export const copdAlias: AliasDefinition = {
  id: "copd",

  canonical: "chronic-obstructive-pulmonary-disease",

  aliases: [
    "COPD",
    "Chronic Obstructive Pulmonary Disease",
  ],

  type: "concept",

  description:
    "Canonical healthcare term representing Chronic Obstructive Pulmonary Disease.",
};
