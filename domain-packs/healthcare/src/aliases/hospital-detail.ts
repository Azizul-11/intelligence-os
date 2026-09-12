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
    "tell me everything about",
    "give me a complete profile of",
    "give me a full report on",
    "give me full details for",
    "show me complete details for",
    "show me everything about",
    "give me everything about",
    "tell me all about",
    "dossier on",
    "dossier for",
    "full report for",
    "full report on",
    "complete profile for",
    "complete profile of",
  ],

  type: "metric",

  description:
    "Aliases for the hospital detail/profile metric.",
};
