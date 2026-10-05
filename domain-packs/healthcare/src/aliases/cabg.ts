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
    // PrePhase 9.5 Round 2: "bypass surgery" is the most common plain phrasing and previously never matched this concept.
    "Bypass Surgery",
    "Bypass Surgeries",
  ],

  type: "concept",

  description:
    "Canonical healthcare term representing Coronary Artery Bypass Graft surgery.",
};
