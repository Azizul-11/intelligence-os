import type { NormalizedHospitalClinicalOutcomeRecord } from "./types";

export interface WarehouseHospitalClinicalOutcome
  extends NormalizedHospitalClinicalOutcomeRecord {}

export function flattenHospitalClinicalOutcomes(
  records: NormalizedHospitalClinicalOutcomeRecord[],
): WarehouseHospitalClinicalOutcome[] {
  return records.map((record) => ({
    ...record,
  }));
}