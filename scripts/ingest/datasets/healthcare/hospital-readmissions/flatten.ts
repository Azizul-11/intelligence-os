import type { NormalizedHospitalReadmissionRecord } from "./types";

export interface WarehouseHospitalReadmission {
  facilityId: string;
  measureCode: string;
  state: string;
  numberOfDischargesRaw: string | null;
  numberOfReadmissionsRaw: string | null;
  predictedReadmissionRate: number | null;
  expectedReadmissionRate: number | null;
  excessReadmissionRatio: number | null;
  footnote: string | null;
  reportingStartDate: Date;
  reportingEndDate: Date;
}

export function flattenHospitalReadmissions(
  records: NormalizedHospitalReadmissionRecord[],
): WarehouseHospitalReadmission[] {
  return records.map((record) => ({
    ...record,
  }));
}