import type { AliasDefinition } from "@intelligence/domain-sdk";

export const hipKneeAlias: AliasDefinition = {
  id: "hip-knee",

  canonical: "elective-primary-tha-tka",

  aliases: [
    "Hip/Knee",
    "Hip and Knee",
    "hip replacement",
    "knee replacement",
    "total hip",
    "total knee",
    // Tier1 Task 1: plural forms - same concept-loss risk as AMI's own
    // "Heart Attacks" gap (see acute-myocardial-infarction.ts).
    "hip replacements",
    "knee replacements",
    "total hips",
    "total knees",
  ],

  type: "concept",

  description:
    "Canonical healthcare term representing elective primary total hip/knee arthroplasty.",
};
