export interface BenchmarkDefinition {
  key: string;

  metricKey: string;

  displayName: string;

  description: string;

  benchmarkType: string;

  value?: number;

  domain: string;

  enabled: boolean;
}