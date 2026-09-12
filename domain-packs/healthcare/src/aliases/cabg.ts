import type { AliasDefinition } from "@intelligence/domain-sdk";

export const cabgAlias: AliasDefinition = {
  id: "cabg",

  canonical: "coronary-artery-bypass-graft",

  aliases: [
    "CABG",
    "Coronary Artery Bypass Graft",
    "Heart Bypass",
    // Tier1 Task 1: plural form - same concept-loss risk as AMI's own
    // "Heart Attacks" gap (see acute-myocardial-infarction.ts).
    "Heart Bypasses",
  ],

  type: "concept",

  description:
    "Canonical healthcare term representing Coronary Artery Bypass Graft surgery.",
};
