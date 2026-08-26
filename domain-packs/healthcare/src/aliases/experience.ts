import type { AliasDefinition } from "@intelligence/domain-sdk";

export const experienceAliases: AliasDefinition = {
  id: "experience-aliases",

  canonical: "experience",

  aliases: [
    "experience",
    "satisfaction",
  ],

  type: "category",

  description:
    "Experience category for patient experience and satisfaction concepts.",
};
