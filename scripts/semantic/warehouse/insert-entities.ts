import type {
  EntityDefinition,
} from "@intelligence/contracts/semantic";

import { supabase } from "../../shared/supabase";

function mapEntity(entity: EntityDefinition) {
  return {
    entity_key: entity.key,

    display_name: entity.displayName,

    description: entity.description,

    status: entity.enabled ? "ACTIVE" : "DISABLED",
  };
}

export async function insertEntities(
  entities: readonly EntityDefinition[],
) {
  const rows = entities.map(mapEntity);


const { data, error } = await supabase
  .from("entity_registry")
  .upsert(rows, {
    onConflict: "entity_key",
  })
  .select();


if (error) {
  console.error(error);
  throw error;
}

  return rows.length;
}