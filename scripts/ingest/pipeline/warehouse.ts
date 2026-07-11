import type { FlattenedWarehouse } from "./flatten";

export interface WarehouseBuildResult {
  hospitals: number;
  states: number;
  counties: number;
  totalRecords: number;
}

export function buildWarehouse(
  warehouse: FlattenedWarehouse,
): WarehouseBuildResult {
  return {
    hospitals: warehouse.hospitals.length,

    states: warehouse.states.length,

    counties: warehouse.counties.length,

    totalRecords:
      warehouse.hospitals.length +
      warehouse.states.length +
      warehouse.counties.length,
  };
}