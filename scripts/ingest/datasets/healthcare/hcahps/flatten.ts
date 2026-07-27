import type { NormalizedHcahpsRecord } from "./types";

export interface WarehouseHospitalHcahps
  extends NormalizedHcahpsRecord {}

export function flattenHospitalHcahps(
  records: NormalizedHcahpsRecord[],
): WarehouseHospitalHcahps[] {
  return records.map((record) => ({
    ...record,
  }));
}