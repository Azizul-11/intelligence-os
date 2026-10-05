import type { AliasDefinition } from "@intelligence/domain-sdk";

// Batch 5B-2: bare "Sepsis" is NOT registered (D1): a lay-vocabulary group maps it and can attach the "Showing Postoperative Sepsis Rate" note;
// these two formal phrases name the measure exactly.
export const sepsisAlias: AliasDefinition = {
  id: "sepsis",

  canonical: "sepsis",

  aliases: ["Postoperative Sepsis", "PSI 13"],

  type: "concept",

  description:
    "Canonical healthcare term representing Postoperative Sepsis (PSI_13).",
};
