import type { WarehouseHospitalClinicalOutcome } from "../ingest/datasets/healthcare/clinical-outcomes/flatten";

import { upsertInBatches } from "./shared/upsert-in-batches";

function mapHospitalClinicalOutcome(
  record: WarehouseHospitalClinicalOutcome,
) {
  return {
    facility_id: record.facilityId,

    measure_code: record.measureCode,
    measure_name: record.measureName,

    compared_to_national: record.comparedToNational,

    denominator: record.denominator,

    score: record.score,

    lower_estimate: record.lowerEstimate,
    higher_estimate: record.higherEstimate,

    footnote: record.footnote,

    reporting_start_date: record.reportingStartDate,
    reporting_end_date: record.reportingEndDate,
  };
}

export async function insertHospitalClinicalOutcomes(
  records: WarehouseHospitalClinicalOutcome[],
) {
  const rows = records.map(mapHospitalClinicalOutcome);

  return upsertInBatches(
  "warehouse_hospital_clinical_outcomes",
  rows,
  "facility_id,measure_code,reporting_start_date,reporting_end_date",
);
}