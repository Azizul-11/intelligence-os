import type {
  DomainExecutionStrategy,
} from "@intelligence/domain-sdk";
import type { ExecutionPlan, ExecutionPlanMetric } from "@intelligence/contracts";

import { HealthcareTemplateSelector } from "./template-selector";
import { HealthcareParameterResolver } from "./parameter-resolver";

export class HealthcareExecutionStrategy
  implements DomainExecutionStrategy
{
  private readonly templateSelector =
    new HealthcareTemplateSelector();

  private readonly parameterResolver =
    new HealthcareParameterResolver();

  /**
   * Phase 7: Healthcare's own result-identity column. Universal Core
   * reads this generically - it never contains this string itself.
   */
  readonly resultIdentityField = "facility_id";

  selectTemplate(
    metricId: string,
    intent: string,
  ): string {
    return this.templateSelector.select(
      metricId,
      intent,
    );
  }

  resolveParameters(
    entities: Record<string, unknown>,
  ): Record<string, unknown> {
    return this.parameterResolver.resolve(
      entities,
    );
  }

  /**
   * Phase 5.3: Select template using ExecutionPlan.
   */
  selectTemplateFromPlan(executionPlan: ExecutionPlan): string {
    // Phase 7.5.5: when the request names an explicit set of hospitals
    // (more than one distinct resolved facility_id under the "hospital"
    // execution parameter, carried as Phase 7.5.3's "in" filter), the
    // request is always answered by fetching exactly those facilities -
    // the same deterministic "by-facility-ids" capability Phase 7
    // already established for secondary-metric enrichment - regardless
    // of surface intent wording ("compare", "list", etc.). A single
    // resolved hospital, or no hospital at all, falls through to the
    // existing intent-based selection below, unchanged.
    const explicitHospitalSet = executionPlan.filters.some(
      (filter) => filter.field === "hospital" && filter.operator === "in",
    );

    if (explicitHospitalSet) {
      return this.templateSelector.select(executionPlan.metric, "byIds");
    }

    // Map ExecutionOperation to intent
    const intentMap: Record<string, string> = {
      lookup: "lookup",
      rank: "ranking",
      aggregate: "aggregation",
      compare: "comparison",
      analyze: "trend",
    };

    const intent = intentMap[executionPlan.operation] || "lookup";

    return this.templateSelector.select(
      executionPlan.metric,
      intent,
    );
  }

  /**
   * Phase 5.3: Resolve parameters using ExecutionPlan.
   */
  resolveParametersFromPlan(executionPlan: ExecutionPlan): Record<string, unknown> {
    const parameters: Record<string, unknown> = {};

    // Convert filters to parameters
    for (const filter of executionPlan.filters) {
      parameters[filter.field] = filter.value;
    }

    // Merge with any additional parameters from ExecutionPlan
    if (executionPlan.parameters) {
      Object.assign(parameters, executionPlan.parameters);
    }

    return this.parameterResolver.resolve(parameters);
  }

  /**
   * Phase 7: select the template used to fetch a secondary metric's
   * values for the exact facility_id set already selected by the
   * primary metric's query.
   */
  selectSecondaryMetricTemplate(
    metric: ExecutionPlanMetric,
    _executionPlan: ExecutionPlan,
  ): string {
    return this.templateSelector.select(metric.metric, "byIds");
  }

  /**
   * Phase 7: resolve parameters for a secondary metric fetch. The
   * identity values are the exact facility_ids the primary query
   * already returned - no independent ranking or limiting happens here.
   */
  resolveSecondaryMetricParameters(
    _metric: ExecutionPlanMetric,
    _executionPlan: ExecutionPlan,
    identityValues: readonly unknown[],
  ): Record<string, unknown> {
    return {
      facilityIds: identityValues,
    };
  }
}