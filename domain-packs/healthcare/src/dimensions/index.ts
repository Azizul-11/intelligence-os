export * from "./hospital";
export * from "./state";
export * from "./county";
export * from "./year";

import { hospitalDimension } from "./hospital";
import { stateDimension } from "./state";
import { countyDimension } from "./county";
import { yearDimension } from "./year";

export const healthcareDimensions = [
  hospitalDimension,
  stateDimension,
  countyDimension,
  yearDimension,
] as const;