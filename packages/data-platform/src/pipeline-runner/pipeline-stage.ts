/**
 * Individual pipeline stages.
 */
export type PipelineStage =
  | "raw-file-registry"
  | "dataset-registry"
  | "validation"
  | "normalization"
  | "entity-resolution"
  | "flattening"
  | "warehouse";