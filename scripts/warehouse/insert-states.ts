import { supabase } from "../shared/supabase";

function mapState(state: Record<string, any>) {
  return {
    state_code: state.code,
  };
}

export async function insertStates(
  states: Record<string, any>[],
) {
  const rows = states.map(mapState);

  const { error } = await supabase
    .from("warehouse_states")
    .upsert(rows, {
      onConflict: "state_code",
    });

  if (error) {
    throw error;
  }

  return rows.length;
}