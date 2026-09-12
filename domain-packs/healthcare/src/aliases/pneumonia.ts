import type { AliasDefinition } from "@intelligence/domain-sdk";

export const pneumoniaAlias: AliasDefinition = {
  id: "pneumonia",

  canonical: "pneumonia",

  aliases: [
    "Pneumonia",
    "PN",
  ],

  type: "concept",

  description:
    "Canonical healthcare term representing Pneumonia.",
};
