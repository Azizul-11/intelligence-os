export interface BenchmarkRegistryContext {
  domainId: string;

  version?: string;

  overwrite?: boolean;

  metadata?: Record<string, unknown>;
}