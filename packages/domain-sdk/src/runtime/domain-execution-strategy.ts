export interface DomainExecutionStrategy {
  selectTemplate(
    metricId: string,
    intent: string,
  ): string;

  resolveParameters(
    entities: Record<string, unknown>,
  ): Record<string, unknown>;
}