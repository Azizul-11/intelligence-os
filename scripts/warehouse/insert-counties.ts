import { supabase } from "../shared/supabase";

function mapCounty(county: Record<string, any>) {
  return {
    state_code: county.state,
    county_name: county.county,
  };
}

export async function insertCounties(
  counties: Record<string, any>[],
) {
  const rows = counties.map(mapCounty);

  const { error } = await supabase
    .from("warehouse_counties")
    .upsert(rows, {
      onConflict: "state_code,county_name",
    });

  if (error) {
    throw error;
  }

  return rows.length;
}