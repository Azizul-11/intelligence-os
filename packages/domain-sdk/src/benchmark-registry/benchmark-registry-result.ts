export interface BenchmarkRegistryResult {
  registered: number;

  skipped: number;

  warnings: string[];

  errors: string[];
}