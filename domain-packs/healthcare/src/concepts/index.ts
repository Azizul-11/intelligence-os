import type { ConceptDefinition } from "@intelligence/domain-sdk";

import { acuteMyocardialInfarction } from "./acute-myocardial-infarction";
import { emergencyDepartment } from "./emergency-department";
import { patientSatisfaction } from "./patient-satisfaction";
import { sepsis } from "./sepsis";
import { stroke } from "./stroke";

export const concepts: readonly ConceptDefinition[] = [
  acuteMyocardialInfarction,
  emergencyDepartment,
  patientSatisfaction,
  sepsis,
  stroke,
];