import type { AliasDefinition } from "@intelligence/domain-sdk";

export const hospitalDetailAlias: AliasDefinition = {
  id: "hospital-detail",

  canonical: "hospital-detail",

  aliases: [
    "tell me about",
    "what can you tell me about",
    "give me information about",
    "show me details for",
    "give me a profile of",
    "what do you know about",
  ],

  type: "metric",

  description:
    "Aliases for the hospital detail/profile metric.",
};
