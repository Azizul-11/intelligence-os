import type { AliasDefinition } from "@intelligence/domain-sdk";

export const clinicalOutcomesAliases: AliasDefinition = {
  id: "clinical-outcomes-aliases",

  canonical: "clinical-outcomes",

  aliases: [
    "clinical outcomes",
    // Batch 3: bare "outcomes" moved to the mortality-rate metric alias (one phrase, one canonical).
    "patient outcomes",
    "treatment outcomes",
  ],

  type: "category",

  description:
    "Clinical outcomes category for treatment effectiveness concepts.",
};
