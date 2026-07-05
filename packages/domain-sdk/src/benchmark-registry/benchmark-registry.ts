import type { BenchmarkDefinition } from "./benchmark-definition";
import type { BenchmarkRegistration } from "./benchmark-registration";
import type { BenchmarkRegistryContext } from "./benchmark-registry-context";
import type { BenchmarkRegistryResult } from "./benchmark-registry-result";

export interface BenchmarkRegistry {
  register(
    registration: BenchmarkRegistration,
    context: BenchmarkRegistryContext,
  ): BenchmarkRegistryResult;

  get(id: string): BenchmarkDefinition | undefined;

  list(): BenchmarkDefinition[];

  has(id: string): boolean;

  remove(id: string): boolean;

  clear(): void;
}