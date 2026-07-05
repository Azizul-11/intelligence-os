import type { MetricDefinition } from "./metric-definition";
import type { MetricRegistration } from "./metric-registration";
import type { MetricRegistryResult } from "./metric-registry-result";

export interface MetricRegistry {
  register(
    registration: MetricRegistration,
  ): MetricRegistryResult;

  unregister(
    id: string,
  ): MetricRegistryResult;

  get(
    id: string,
  ): MetricDefinition | undefined;

  getAll(): MetricDefinition[];
}