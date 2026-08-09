import type { AliasDefinition } from "@intelligence/domain-sdk";

export const clinicalOutcomesAliases: AliasDefinition = {
  id: "clinical-outcomes-aliases",

  canonical: "clinical-outcomes",

  aliases: [
    "clinical outcomes",
    "outcomes",
    "patient outcomes",
    "treatment outcomes",
  ],

  type: "category",

  description:
    "Clinical outcomes category for treatment effectiveness concepts.",
};
