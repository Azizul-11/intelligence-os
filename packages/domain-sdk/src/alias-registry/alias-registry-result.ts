import type { AliasDefinition } from "./alias-definition";

export interface AliasRegistryResult {
  /**
   * Successfully registered aliases.
   */
  aliases: AliasDefinition[];

  /**
   * Registration warnings.
   */
  warnings?: string[];
}