import type { BenchmarkDefinition } from "./benchmark-definition";

export interface BenchmarkRegistration {
  benchmark: BenchmarkDefinition;

  overwrite?: boolean;
}