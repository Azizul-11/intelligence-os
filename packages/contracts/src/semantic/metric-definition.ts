export interface MetricDefinition {
  key: string;

  displayName: string;

  description: string;

  category: string;

  unit: string;

  aggregation: string;

  dataType: string;

  rankable: boolean;

  benchmarkSupported: boolean;

  domain: string;

  enabled: boolean;
}