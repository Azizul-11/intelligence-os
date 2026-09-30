/** A domain's alias definitions submitted for registration. */
import type { AliasDefinition } from "./alias-definition";

export interface AliasRegistration {
  domain: string;

  aliases: AliasDefinition[];
}