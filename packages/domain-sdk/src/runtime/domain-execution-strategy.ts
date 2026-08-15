import type { ExecutionPlan, ExecutionPlanMetric } from "@intelligence/contracts";

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

  /**
   * Phase 7: the column name that uniquely identifies a result row for
   * this domain (e.g. Healthcare declares "facility_id").
   *
   * Optional - a domain that does not declare this cannot participate in
   * multi-metric row-joining; Universal Core never assumes or hardcodes
   * a column name of its own.
   */
  resultIdentityField?: string;

  /**
   * Phase 7: select the template used to fetch a SECONDARY metric's
   * values for an already-determined set of result-identity values
   * (e.g. the identity values already selected by the primary metric's
   * query).
   *
   * Optional - domains that don't implement this simply get
   * single-metric behavior even for a multi-metric plan.
   */
  selectSecondaryMetricTemplate?(
    metric: ExecutionPlanMetric,
    executionPlan: ExecutionPlan,
  ): string;

  /**
   * Phase 7: resolve parameters for a secondary metric fetch, given the
   * already-executed primary result's identity values.
   */
  resolveSecondaryMetricParameters?(
    metric: ExecutionPlanMetric,
    executionPlan: ExecutionPlan,
    identityValues: readonly unknown[],
  ): Record<string, unknown>;
}