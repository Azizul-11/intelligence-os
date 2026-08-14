import type {
  DomainExecutionStrategy,
} from "@intelligence/domain-sdk";
import type { ExecutionPlan } from "@intelligence/contracts";

import { HealthcareTemplateSelector } from "./template-selector";
import { HealthcareParameterResolver } from "./parameter-resolver";

export class HealthcareExecutionStrategy
  implements DomainExecutionStrategy
{
  private readonly templateSelector =
    new HealthcareTemplateSelector();

  private readonly parameterResolver =
    new HealthcareParameterResolver();

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
}