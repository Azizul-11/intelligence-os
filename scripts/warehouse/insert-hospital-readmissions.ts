import type { WarehouseHospitalReadmission } from "../ingest/datasets/healthcare/hospital-readmissions/flatten";

import { upsertInBatches } from "./shared/upsert-in-batches";

function mapHospitalReadmission(
  record: WarehouseHospitalReadmission,
) {
  return {
    facility_id: record.facilityId,
    measure_code: record.measureCode,
    state: record.state,

    number_of_discharges_raw: record.numberOfDischargesRaw,
    number_of_readmissions_raw: record.numberOfReadmissionsRaw,

    predicted_readmission_rate: record.predictedReadmissionRate,
    expected_readmission_rate: record.expectedReadmissionRate,
    excess_readmission_ratio: record.excessReadmissionRatio,

    footnote: record.footnote,

    reporting_start_date: record.reportingStartDate,
    reporting_end_date: record.reportingEndDate,
  };
}

export async function insertHospitalReadmissions(
  records: WarehouseHospitalReadmission[],
) {
  const rows = records.map(mapHospitalReadmission);

  return upsertInBatches(
    "warehouse_hospital_readmissions",
    rows,
    "facility_id,measure_code",
  );
}