import type { AliasDefinition } from "./alias-definition";

export interface AliasRegistration {
  /**
   * Domain identifier.
   */
  domain: string;

  /**
   * Alias definitions contributed by the domain.
   */
  aliases: AliasDefinition[];
}