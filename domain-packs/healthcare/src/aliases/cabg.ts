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
    // PrePhase 9.5 Round 2: "bypass surgery" (with no "heart"/"CABG")
    // is the single most common plain-English phrasing for this
    // procedure - confirmed missing via live dogfooding
    // ("bypass surgery readmission" never matched this concept at
    // all before this addition).
    "Bypass Surgery",
    "Bypass Surgeries",
  ],

  type: "concept",

  description:
    "Canonical healthcare term representing Coronary Artery Bypass Graft surgery.",
};
