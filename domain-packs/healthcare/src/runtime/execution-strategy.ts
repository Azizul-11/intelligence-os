import type {
  DomainExecutionStrategy,
} from "@intelligence/domain-sdk";

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
}