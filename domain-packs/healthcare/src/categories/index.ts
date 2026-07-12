export * from "./quality";
export * from "./safety";
export * from "./operations";
export * from "./experience";
export * from "./clinical-outcomes";

import { qualityCategoryDefinition  } from "./quality";
import { safetyCategoryDefinition } from "./safety";
import { operationsCategoryDefinition } from "./operations";
import { experienceCategoryDefinition } from "./experience";
import { clinicalOutcomesCategoryDefinition } from "./clinical-outcomes";

export const healthcareCategories = [
  qualityCategoryDefinition,
  safetyCategoryDefinition,
  operationsCategoryDefinition,
  experienceCategoryDefinition,
  clinicalOutcomesCategoryDefinition,
] as const;