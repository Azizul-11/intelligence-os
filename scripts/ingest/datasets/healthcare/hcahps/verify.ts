import type { WarehouseHospitalHcahps } from "./flatten";

export interface HcahpsVerificationResult {
  passed: boolean;

  hasRows: boolean;

  duplicateKeysPassed: boolean;

  missingFacilityIdsPassed: boolean;

  missingMeasureCodesPassed: boolean;

  duplicateKeys: string[];
}

export function verifyHospitalHcahps(
  records: WarehouseHospitalHcahps[],
): HcahpsVerificationResult {
  const duplicateKeys: string[] = [];
  const seen = new Set<string>();

  let missingFacilityIdsPassed = true;
  let missingMeasureCodesPassed = true;

  for (const record of records) {
    if (!record.facilityId) {
      missingFacilityIdsPassed = false;
    }

    if (!record.measureCode) {
      missingMeasureCodesPassed = false;
    }

    const key = [
      record.facilityId,
      record.measureCode,
      record.reportingStartDate.toISOString(),
      record.reportingEndDate.toISOString(),
    ].join("|");

    if (seen.has(key)) {
      duplicateKeys.push(key);
    } else {
      seen.add(key);
    }
  }

  const hasRows = records.length > 0;

  const duplicateKeysPassed = duplicateKeys.length === 0;

  const passed =
    hasRows &&
    duplicateKeysPassed &&
    missingFacilityIdsPassed &&
    missingMeasureCodesPassed;

  return {
    passed,
    hasRows,
    duplicateKeysPassed,
    missingFacilityIdsPassed,
    missingMeasureCodesPassed,
    duplicateKeys,
  };
}