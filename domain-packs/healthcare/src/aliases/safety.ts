import type { AliasDefinition } from "@intelligence/domain-sdk";

export const safetyAliases: AliasDefinition = {
  id: "safety-aliases",

  canonical: "safety",

  aliases: [
    "safety",
    "patient safety",
    "clinical safety",
  ],

  type: "category",

  description:
    "Safety category for patient safety and clinical risk concepts.",
};
