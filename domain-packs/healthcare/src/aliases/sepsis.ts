import type { AliasDefinition } from "@intelligence/domain-sdk";

// Batch 5B-2: bare "Sepsis" is deliberately NOT registered here - Decision D1 maps casual "sepsis"/"sepsis rate" via
// a lay-vocabulary group instead (runtime/lay-vocabulary.ts), which can attach the "Showing Postoperative Sepsis
// Rate for 'sepsis'" note a silent alias cannot. These two formal phrases already name the postoperative measure
// exactly, so they resolve directly.
export const sepsisAlias: AliasDefinition = {
  id: "sepsis",

  canonical: "sepsis",

  aliases: ["Postoperative Sepsis", "PSI 13"],

  type: "concept",

  description:
    "Canonical healthcare term representing Postoperative Sepsis (PSI_13).",
};
