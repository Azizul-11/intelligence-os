import type { CapabilityRegistration } from "./capability-registration";
import type { CapabilityRegistryContext } from "./capability-registry-context";
import type { CapabilityRegistryResult } from "./capability-registry-result";

export interface CapabilityRegistry {
  register(
    registration: CapabilityRegistration
  ): void;

  list(
    context: CapabilityRegistryContext
  ): CapabilityRegistryResult;
}