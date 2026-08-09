import type { AliasDefinition } from "@intelligence/domain-sdk";

export const qualityAliases: AliasDefinition = {
  id: "quality-aliases",

  canonical: "quality",

  aliases: [
    "quality",
    "quality of care",
    "care quality",
    "quality performance",
  ],

  type: "category",

  description:
    "Quality category for healthcare performance concepts.",
};
