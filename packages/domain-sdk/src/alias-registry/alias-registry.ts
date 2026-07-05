import type { AliasDefinition } from "./alias-definition";
import type { AliasRegistration } from "./alias-registration";
import type { AliasRegistryContext } from "./alias-registry-context";
import type { AliasRegistryResult } from "./alias-registry-result";

export interface AliasRegistry {
  /**
   * Register aliases for a domain.
   */
  register(
    registration: AliasRegistration,
    context: AliasRegistryContext,
  ): AliasRegistryResult;

  /**
   * Returns all registered aliases.
   */
  list(): AliasDefinition[];

  /**
   * Finds an alias by its canonical value.
   */
  find(canonical: string): AliasDefinition | undefined;

  /**
   * Resolves an input value to its canonical alias definition.
   */
  resolve(value: string): AliasDefinition | undefined;
}