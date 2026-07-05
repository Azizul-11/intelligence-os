import type { AliasDefinition } from "@intelligence/domain-sdk";

export const hcahpsAlias: AliasDefinition = {
  id: "hcahps",

  canonical:
    "Hospital Consumer Assessment of Healthcare Providers and Systems",

  aliases: [
    "HCAHPS",
    "Hospital Consumer Assessment of Healthcare Providers and Systems",
  ],

  type: "metric",

  description:
    "National patient experience survey administered by CMS.",
};