import type { BenchmarkClassification } from "./benchmark-classification";
import type { BenchmarkType } from "./benchmark-type";

export interface BenchmarkDefinition {
  id: string;

  metricId: string;

  displayName: string;

  description?: string;

  benchmarkType: BenchmarkType;

  classification: BenchmarkClassification;

  minimumValue?: number;

  maximumValue?: number;

  higherIsBetter?: boolean;

  enabled?: boolean;
}