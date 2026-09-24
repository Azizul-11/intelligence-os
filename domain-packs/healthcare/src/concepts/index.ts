import type { ConceptDefinition } from "@intelligence/domain-sdk";

import { acuteMyocardialInfarction } from "./acute-myocardial-infarction";
import { emergencyDepartment } from "./emergency-department";
import { patientSatisfaction } from "./patient-satisfaction";
import { sepsis } from "./sepsis";
import { stroke } from "./stroke";
import { coronaryArteryBypassGraft } from "./coronary-artery-bypass-graft";
import { chronicObstructivePulmonaryDisease } from "./chronic-obstructive-pulmonary-disease";
import { electivePrimaryThaTka } from "./elective-primary-tha-tka";
import { heartFailure } from "./heart-failure";
import { pneumonia } from "./pneumonia";
import { hospitalWideMortality } from "./hospital-wide-mortality";
import { psiConcepts } from "./psi";
import { hcahpsDimensionConcepts } from "./hcahps-dimensions";

export const concepts: readonly ConceptDefinition[] = [
  acuteMyocardialInfarction,
  emergencyDepartment,
  patientSatisfaction,
  sepsis,
  stroke,
  coronaryArteryBypassGraft,
  chronicObstructivePulmonaryDisease,
  electivePrimaryThaTka,
  heartFailure,
  pneumonia,
  hospitalWideMortality,
  ...psiConcepts,
  ...hcahpsDimensionConcepts,
];