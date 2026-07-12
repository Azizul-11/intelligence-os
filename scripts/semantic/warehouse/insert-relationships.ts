import type {
  RelationshipDefinition,
} from "@intelligence/contracts/semantic";

import { supabase } from "../../shared/supabase";

function mapRelationship(
  relationship: RelationshipDefinition,
) {
  return {
    source_key: relationship.source,

    target_key: relationship.target,

    relationship_type: relationship.relationship,
  };
}

export async function insertRelationships(
  relationships: readonly RelationshipDefinition[],
) {
  const rows = relationships.map(mapRelationship);

  const { error } = await supabase
    .from("relationship_registry")
    .upsert(rows, {
      onConflict:
        "source_key,target_key,relationship_type",
    });

  if (error) {
    throw error;
  }

  return rows.length;
}