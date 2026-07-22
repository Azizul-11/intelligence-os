import { supabase } from "../shared/supabase";

export async function findDatasetByChecksum(
  checksum: string,
) {
  const { data, error } = await supabase
    .from("dataset_registry")   
    .select("*")
    .eq("checksum", checksum)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}