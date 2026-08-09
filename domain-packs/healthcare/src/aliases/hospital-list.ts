import type { AliasDefinition } from "@intelligence/domain-sdk";

export const hospitalListAlias: AliasDefinition = {
  id: "hospital-list",

  canonical: "hospital-list",

  aliases: [
    "hospital list",
    "list hospitals",
    "show hospitals",
    "hospitals in",
    "list of hospitals",
  ],

  type: "metric",

  description:
    "Aliases for hospital list metric.",
};
