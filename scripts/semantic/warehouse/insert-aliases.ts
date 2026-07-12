import type {
  AliasDefinition,
} from "@intelligence/contracts/semantic";

import { supabase } from "../../shared/supabase";

function mapAlias(alias: AliasDefinition) {
  return {
    alias: alias.alias,

    canonical_key: alias.canonicalKey,

    canonical_type: "semantic",
  };
}

export async function insertAliases(
  aliases: readonly AliasDefinition[],
) {
  const rows = aliases.map(mapAlias);

  const { error } = await supabase
    .from("alias_registry")
    .upsert(rows, {
      onConflict: "alias",
    });

  if (error) {
    throw error;
  }

  return rows.length;
}