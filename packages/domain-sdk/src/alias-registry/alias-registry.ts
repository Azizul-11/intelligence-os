/** CRUD + resolution contract for a domain's registered aliases. */
import type { AliasDefinition } from "./alias-definition";
import type { AliasRegistration } from "./alias-registration";
import type { AliasRegistryContext } from "./alias-registry-context";
import type { AliasRegistryResult } from "./alias-registry-result";

export interface AliasRegistry {
  register(
    registration: AliasRegistration,
    context: AliasRegistryContext,
  ): AliasRegistryResult;

  list(): AliasDefinition[];

  find(canonical: string): AliasDefinition | undefined;

  /** Resolves an input value to its canonical alias definition. */
  resolve(value: string): AliasDefinition | undefined;
}