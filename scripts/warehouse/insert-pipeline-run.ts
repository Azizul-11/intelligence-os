import { supabase } from "../shared/supabase";

export interface PipelineRunRow {
  dataset_id: string;
  status: string;
  rows_processed: number;
  rows_inserted: number;
  rows_failed: number;
  started_at: string;
  finished_at: string;
  duration_ms: number;
}

export async function insertPipelineRun(
  run: PipelineRunRow,
) {
  const { error } = await supabase
    .from("pipeline_runs")
    .insert(run);

  if (error) {
    throw error;
  }
}