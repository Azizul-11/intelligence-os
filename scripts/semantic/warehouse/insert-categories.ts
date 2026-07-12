import type {
  CategoryDefinition,
} from "@intelligence/contracts/semantic";

import { supabase } from "../../shared/supabase";

function mapCategory(category: CategoryDefinition) {
  return {
    category_key: category.key,

    display_name: category.displayName,

    description: category.description,
  };
}

export async function insertCategories(
  categories: readonly CategoryDefinition[],
) {
  const rows = categories.map(mapCategory);

  const { error } = await supabase
    .from("category_registry")
    .upsert(rows, {
      onConflict: "category_key",
    });

  if (error) {
    throw error;
  }

  return rows.length;
}