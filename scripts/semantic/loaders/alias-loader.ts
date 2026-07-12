import type {
  AliasDefinition as DomainAliasDefinition,
} from "@intelligence/domain-sdk";

import type {
  AliasDefinition as SemanticAliasDefinition,
} from "@intelligence/contracts/semantic";

/**
 * Converts Domain SDK aliases into canonical Semantic aliases.
 */
export function loadAliases(
  aliases: readonly DomainAliasDefinition[],
  domain: string,
): SemanticAliasDefinition[] {
  return aliases.flatMap((alias) => {
    if (!alias.canonical) {
      throw new Error(
        `Alias "${alias.id}" is missing a canonical value.`,
      );
    }

   return alias.aliases.map((value) => ({
  alias: value.trim().toLowerCase(),

  canonicalKey: alias.canonical,

  type: alias.type,

  domain,

  enabled: !(alias.deprecated ?? false),
}));
  });
}