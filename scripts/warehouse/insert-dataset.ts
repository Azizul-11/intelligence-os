import { supabase } from "../shared/supabase";

export interface DatasetRegistryRow {
  dataset_id: string;
  dataset_name: string;
  domain: string;
  provider: string;
  source: string;
  version: string;
  format: string;
  row_count: number;
  column_count: number;
  checksum: string;
  last_ingested_at: string;
}

export async function insertDataset(
  dataset: DatasetRegistryRow,
) {
  const { error } = await supabase
    .from("dataset_registry")
    .upsert(dataset, {
      onConflict: "dataset_id",
    });

  if (error) {
    throw error;
  }
}