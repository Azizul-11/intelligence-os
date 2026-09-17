import type { AliasDefinition } from "@intelligence/domain-sdk";

export const hospitalListAlias: AliasDefinition = {
  id: "hospital-list",

  canonical: "hospital-list",

  aliases: [
    "hospital list",
    "list hospitals",
    "show hospitals",
    "hospitals in",
    // Bug L Beyond (2026-09-17): singular/plural gap, same class Tier1
    // T1 already closed elsewhere in this file family - "hospital in"
    // (singular) was missing while "hospitals in" (plural) was already
    // registered, so "hospital in California"/"hospital in CA" silently
    // fell through to the unrelated default-ranking-discovery fallback
    // (a real, but differently-shaped, top-10 answer) instead of the
    // intended full geographic list - confirmed live, independent of
    // and pre-existing before this session's state-abbreviation fix.
    "hospital in",
    "list of hospitals",
  ],

  type: "metric",

  description:
    "Aliases for hospital list metric.",
};
