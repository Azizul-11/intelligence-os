import type { AliasDefinition } from "@intelligence/domain-sdk";

export const strokeAlias: AliasDefinition = {
  id: "stroke",

  canonical: "stroke",

  aliases: [
    "Stroke",
    "Strokes",
    "Cerebrovascular Accident",
  ],

  type: "concept",

  description:
    "Canonical healthcare term representing Stroke.",
};
