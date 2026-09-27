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
    // V4 fix plan (Batch 3): the concept's own CMS display name, exactly as the model writes it back from the
    // prompt (see mortality-rate.ts's HIP_KNEE_TERMS for the matching complication-rate phrasing).
    "Elective Primary Hip/Knee Arthroplasty",
  ],

  type: "concept",

  description:
    "Canonical healthcare term representing elective primary total hip/knee arthroplasty.",
};
