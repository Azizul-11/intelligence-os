import type { ConceptDefinition } from "@intelligence/domain-sdk";

// Batch 5B-2: the 11 individual AHRQ/CMS Patient Safety Indicators the warehouse holds, plus the PSI 90 composite.
// PSI_05 and PSI_07 do not exist in this warehouse (5B audit section 2.2) and stay unregistered/unsupported.
// Every code maps only to the "patient-safety-indicator" metric - never to "mortality-rate", even PSI_04 (a death
// rate among a surgical population): filing a complication/death-after-complication rate under Mortality Rate would
// mislabel it the way the pre-existing COMP_HIP_KNEE precedent already mislabels a complication rate as a
// "Mortality Rate for Elective Primary Hip/Knee Arthroplasty" - not a mistake to repeat.

export const pressureUlcer: ConceptDefinition = {
  id: "pressure-ulcer",
  name: "pressure-ulcer",
  displayName: "Pressure Ulcer",
  description: "Stage III/IV pressure ulcer (bedsore) acquired during the hospital stay.",
  measureCodesByMetric: { "patient-safety-indicator": "PSI_03" },
};

export const deathAfterSeriousSurgicalComplication: ConceptDefinition = {
  id: "death-after-serious-surgical-complication",
  name: "death-after-serious-surgical-complication",
  displayName: "Death After Serious Surgical Complication",
  description: "Death rate among surgical inpatients who developed a serious, treatable complication (failure to rescue).",
  measureCodesByMetric: { "patient-safety-indicator": "PSI_04" },
};

export const iatrogenicPneumothorax: ConceptDefinition = {
  id: "iatrogenic-pneumothorax",
  name: "iatrogenic-pneumothorax",
  displayName: "Iatrogenic Pneumothorax",
  description: "A collapsed lung caused by a medical procedure.",
  measureCodesByMetric: { "patient-safety-indicator": "PSI_06" },
};

export const inHospitalFallWithFracture: ConceptDefinition = {
  id: "in-hospital-fall-with-fracture",
  name: "in-hospital-fall-with-fracture",
  displayName: "In-Hospital Fall With Fracture",
  description: "A fall during the hospital stay that resulted in a fracture.",
  measureCodesByMetric: { "patient-safety-indicator": "PSI_08" },
};

export const postoperativeHemorrhageOrHematoma: ConceptDefinition = {
  id: "postoperative-hemorrhage-or-hematoma",
  name: "postoperative-hemorrhage-or-hematoma",
  displayName: "Postoperative Hemorrhage or Hematoma",
  description: "Bleeding or a blood clot at the surgical site requiring treatment after surgery.",
  measureCodesByMetric: { "patient-safety-indicator": "PSI_09" },
};

export const postoperativeAcuteKidneyInjury: ConceptDefinition = {
  id: "postoperative-acute-kidney-injury",
  name: "postoperative-acute-kidney-injury",
  displayName: "Postoperative Acute Kidney Injury",
  description: "Acute kidney injury requiring dialysis after surgery.",
  measureCodesByMetric: { "patient-safety-indicator": "PSI_10" },
};

export const postoperativeRespiratoryFailure: ConceptDefinition = {
  id: "postoperative-respiratory-failure",
  name: "postoperative-respiratory-failure",
  displayName: "Postoperative Respiratory Failure",
  description: "Respiratory failure requiring ventilation support after surgery.",
  measureCodesByMetric: { "patient-safety-indicator": "PSI_11" },
};

export const perioperativeBloodClot: ConceptDefinition = {
  id: "perioperative-blood-clot",
  name: "perioperative-blood-clot",
  displayName: "Perioperative Blood Clot",
  description: "A pulmonary embolism or deep vein thrombosis occurring around the time of surgery.",
  measureCodesByMetric: { "patient-safety-indicator": "PSI_12" },
};

// PSI_13 (postoperative sepsis) is not registered here: it is concepts/sepsis.ts, updated in place, so the domain
// keeps exactly one Sepsis concept rather than a duplicate that would compete with it for the same bare word.

export const postoperativeWoundDehiscence: ConceptDefinition = {
  id: "postoperative-wound-dehiscence",
  name: "postoperative-wound-dehiscence",
  displayName: "Postoperative Wound Dehiscence",
  description: "A surgical wound reopening after an abdominopelvic surgery.",
  measureCodesByMetric: { "patient-safety-indicator": "PSI_14" },
};

export const accidentalPunctureOrLaceration: ConceptDefinition = {
  id: "accidental-puncture-or-laceration",
  name: "accidental-puncture-or-laceration",
  displayName: "Accidental Puncture or Laceration",
  description: "An accidental cut or puncture of an organ or blood vessel during an abdominopelvic procedure.",
  measureCodesByMetric: { "patient-safety-indicator": "PSI_15" },
};

export const patientSafetyComposite: ConceptDefinition = {
  id: "patient-safety-composite",
  name: "patient-safety-composite",
  displayName: "Patient Safety Composite",
  description: "PSI 90: the CMS composite of patient safety and adverse-event indicators.",
  measureCodesByMetric: { "patient-safety-indicator": "PSI_90" },
};

export const psiConcepts: readonly ConceptDefinition[] = [
  pressureUlcer,
  deathAfterSeriousSurgicalComplication,
  iatrogenicPneumothorax,
  inHospitalFallWithFracture,
  postoperativeHemorrhageOrHematoma,
  postoperativeAcuteKidneyInjury,
  postoperativeRespiratoryFailure,
  perioperativeBloodClot,
  postoperativeWoundDehiscence,
  accidentalPunctureOrLaceration,
  patientSafetyComposite,
];
