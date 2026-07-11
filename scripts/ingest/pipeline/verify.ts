import type { WarehouseBuildResult } from "./warehouse";

export interface VerificationResult {
  passed: boolean;

  checks: {
    hospitals: boolean;
    states: boolean;
    counties: boolean;
    warehouse: boolean;
  };
}

export function verifyWarehouse(
  warehouse: WarehouseBuildResult,
): VerificationResult {
  const checks = {
    hospitals: warehouse.hospitals > 0,

    states: warehouse.states > 0,

    counties: warehouse.counties > 0,

    warehouse: warehouse.totalRecords > 0,
  };

  return {
    passed: Object.values(checks).every(Boolean),

    checks,
  };
}