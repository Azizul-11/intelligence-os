/** Outcome of an AliasRegistry.register() call. */
import type { AliasDefinition } from "./alias-definition";

export interface AliasRegistryResult {
  aliases: AliasDefinition[];

  warnings?: string[];
}