import type {
  WarehouseEntity,
  WarehouseMetric,
  WarehouseNarrative,
} from "@intelligence/contracts";

/**
 * Represents one warehouse record.
 */
export interface WarehouseRecord {
  entity?: WarehouseEntity;

  metrics: WarehouseMetric[];

  narratives: WarehouseNarrative[];
}