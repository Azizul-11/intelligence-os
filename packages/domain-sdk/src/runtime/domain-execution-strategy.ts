import type { ExecutionPlan } from "@intelligence/contracts";

export interface DomainExecutionStrategy {
  selectTemplate(
    metricId: string,
    intent: string,
  ): string;

  resolveParameters(
    entities: Record<string, unknown>,
  ): Record<string, unknown>;

  /**
   * Phase 5.3: Select template using ExecutionPlan.
   *
   * Provides execution-focused structure for capability resolution.
   * Falls back to selectTemplate if not implemented.
   */
  selectTemplateFromPlan?(
    executionPlan: ExecutionPlan,
  ): string;

  /**
   * Phase 5.3: Resolve parameters using ExecutionPlan.
   *
   * Converts ExecutionPlan filters to execution parameters.
   * Falls back to resolveParameters if not implemented.
   */
  resolveParametersFromPlan?(
    executionPlan: ExecutionPlan,
  ): Record<string, unknown>;
}