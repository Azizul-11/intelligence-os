/** The hooks a Domain SDK implements to select templates, resolve parameters, and generate suggestions for an ExecutionPlan. */
import type { ExecutionPlan, ExecutionPlanMetric } from "@intelligence/contracts";
import type { EntityResolutionResult } from "./entity-resolution-result";
import type { SuggestionContext } from "./suggestion-context";

export interface DomainExecutionStrategy {
  selectTemplate(
    metricId: string,
    intent: string,
  ): string;

  /** Pre-Phase 9 Tier0: reports a plan-level ambiguity (e.g. a geographic filter matching multiple states) - a non-empty array refuses the request via the same Phase 8.3 clarification gate as entity ambiguity. Optional. */
  checkPlanAmbiguity?(
    executionPlan: ExecutionPlan,
  ): EntityResolutionResult[] | undefined;

  resolveParameters(
    entities: Record<string, unknown>,
  ): Record<string, unknown>;

  /** Phase 5.3: selects a template from the full ExecutionPlan. Falls back to selectTemplate if not implemented. */
  selectTemplateFromPlan?(
    executionPlan: ExecutionPlan,
  ): string;

  /** Phase 5.3: resolves parameters from the full ExecutionPlan. Falls back to resolveParameters if not implemented. */
  resolveParametersFromPlan?(
    executionPlan: ExecutionPlan,
  ): Record<string, unknown>;

  /** Phase 7: the column that uniquely identifies a result row (e.g. "facility_id"). Needed for multi-metric row-joining. */
  resultIdentityField?: string;

  /** Phase 7: selects the template for fetching a secondary metric's values for an already-selected identity set. */
  selectSecondaryMetricTemplate?(
    metric: ExecutionPlanMetric,
    executionPlan: ExecutionPlan,
  ): string;

  /** Phase 7: resolves parameters for a secondary metric fetch, given the primary result's identity values. */
  resolveSecondaryMetricParameters?(
    metric: ExecutionPlanMetric,
    executionPlan: ExecutionPlan,
    identityValues: readonly unknown[],
  ): Record<string, unknown>;

  /** Tier1 Task 6 + LLM Layer 2: generates candidate follow-up/recovery questions. Universal Core dry-run validates each before surfacing any. */
  generateSuggestions?(context: SuggestionContext): Promise<string[]>;
}