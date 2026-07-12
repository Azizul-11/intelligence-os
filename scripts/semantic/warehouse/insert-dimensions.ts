import type {
  DimensionDefinition,
} from "@intelligence/contracts/semantic";

import { supabase } from "../../shared/supabase";

function mapDimension(dimension: DimensionDefinition) {
  return {
    dimension_key: dimension.key,

    display_name: dimension.displayName,

    description: dimension.description,
  };
}

export async function insertDimensions(
  dimensions: readonly DimensionDefinition[],
) {
  const rows = dimensions.map(mapDimension);

  const { error } = await supabase
    .from("dimension_registry")
    .upsert(rows, {
      onConflict: "dimension_key",
    });

  if (error) {
    throw error;
  }

  return rows.length;
}