import type { AliasDefinition } from "@intelligence/domain-sdk";

// Batch 5B-2: concept aliases for the 11 individual PSI concepts (concepts/psi.ts). "in-hospital fall" is
// deliberately never registered bare: 17 hospital names contain "Falls" (5B audit section 2.9), so only the
// multi-word "in-hospital fall(s) with fracture" phrasing is aliased. Two aliases per concept, not the fuller
// synonym lists an earlier draft of this file had (Bedsore, DVT, Pulmonary Embolism, Wound Reopening, the PSI_03
// through PSI_15 numeric codes...): the normalizer prompt shows every alias for every concept in brackets
// (packages/llm-model-gateway, universal, not editable here), and 11 concepts with 5-7 aliases each measured
// 11,962 characters - 1,462 over the 10,500 guard. Cut to what this batch's own catalog rows actually need; the
// dropped synonyms are not lost capability so much as deferred - add them back only if a real question needs one
// and the guard has room (D8, this batch's own report).
export const pressureUlcerAlias: AliasDefinition = {
  id: "pressure-ulcer",
  canonical: "pressure-ulcer",
  aliases: ["Pressure Ulcer", "Pressure Ulcers"],
  type: "concept",
  description: "Canonical healthcare term representing Pressure Ulcer (PSI_03).",
};

export const deathAfterSeriousSurgicalComplicationAlias: AliasDefinition = {
  id: "death-after-serious-surgical-complication",
  canonical: "death-after-serious-surgical-complication",
  aliases: ["Death After Serious Surgical Complication", "Failure to Rescue"],
  type: "concept",
  description: "Canonical healthcare term representing Death After Serious Surgical Complication (PSI_04).",
};

export const iatrogenicPneumothoraxAlias: AliasDefinition = {
  id: "iatrogenic-pneumothorax",
  canonical: "iatrogenic-pneumothorax",
  aliases: ["Iatrogenic Pneumothorax", "Collapsed Lung"],
  type: "concept",
  description: "Canonical healthcare term representing Iatrogenic Pneumothorax (PSI_06).",
};

export const inHospitalFallWithFractureAlias: AliasDefinition = {
  id: "in-hospital-fall-with-fracture",
  canonical: "in-hospital-fall-with-fracture",
  aliases: ["In-Hospital Fall With Fracture", "In-Hospital Falls With Fracture"],
  type: "concept",
  description: "Canonical healthcare term representing In-Hospital Fall With Fracture (PSI_08).",
};

export const postoperativeHemorrhageOrHematomaAlias: AliasDefinition = {
  id: "postoperative-hemorrhage-or-hematoma",
  canonical: "postoperative-hemorrhage-or-hematoma",
  aliases: ["Postoperative Hemorrhage or Hematoma", "Postoperative Hemorrhage"],
  type: "concept",
  description: "Canonical healthcare term representing Postoperative Hemorrhage or Hematoma (PSI_09).",
};

export const postoperativeAcuteKidneyInjuryAlias: AliasDefinition = {
  id: "postoperative-acute-kidney-injury",
  canonical: "postoperative-acute-kidney-injury",
  aliases: ["Postoperative Acute Kidney Injury", "Kidney Injury Requiring Dialysis"],
  type: "concept",
  description: "Canonical healthcare term representing Postoperative Acute Kidney Injury (PSI_10).",
};

export const postoperativeRespiratoryFailureAlias: AliasDefinition = {
  id: "postoperative-respiratory-failure",
  canonical: "postoperative-respiratory-failure",
  aliases: ["Postoperative Respiratory Failure", "Respiratory Failure After Surgery"],
  type: "concept",
  description: "Canonical healthcare term representing Postoperative Respiratory Failure (PSI_11).",
};

export const perioperativeBloodClotAlias: AliasDefinition = {
  id: "perioperative-blood-clot",
  canonical: "perioperative-blood-clot",
  aliases: ["Perioperative Blood Clot", "Blood Clots After Surgery"],
  type: "concept",
  description: "Canonical healthcare term representing Perioperative Blood Clot (PSI_12).",
};

export const postoperativeWoundDehiscenceAlias: AliasDefinition = {
  id: "postoperative-wound-dehiscence",
  canonical: "postoperative-wound-dehiscence",
  aliases: ["Postoperative Wound Dehiscence", "Wound Dehiscence"],
  type: "concept",
  description: "Canonical healthcare term representing Postoperative Wound Dehiscence (PSI_14).",
};

export const accidentalPunctureOrLacerationAlias: AliasDefinition = {
  id: "accidental-puncture-or-laceration",
  canonical: "accidental-puncture-or-laceration",
  aliases: ["Accidental Puncture or Laceration", "Accidental Puncture"],
  type: "concept",
  description: "Canonical healthcare term representing Accidental Puncture or Laceration (PSI_15).",
};

export const patientSafetyCompositeAlias: AliasDefinition = {
  id: "patient-safety-composite",
  canonical: "patient-safety-composite",
  aliases: ["Patient Safety Composite", "PSI 90"],
  type: "concept",
  description: "Canonical healthcare term representing the PSI 90 Patient Safety Composite.",
};
