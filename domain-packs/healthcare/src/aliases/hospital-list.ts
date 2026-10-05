import type { AliasDefinition } from "@intelligence/domain-sdk";

export const hospitalListAlias: AliasDefinition = {
  id: "hospital-list",

  canonical: "hospital-list",

  aliases: [
    "hospital list",
    "list hospitals",
    "show hospitals",
    "hospitals in",
    // Bug L Beyond (2026-09-17): singular "hospital in" was missing while plural was registered, so "hospital in CA" fell to the default-ranking fallback.
    "hospital in",
    "list of hospitals",
  ],

  type: "metric",

  description:
    "Aliases for hospital list metric.",
};
