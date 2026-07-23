import { supabase } from './../../shared/supabase';

const DEFAULT_BATCH_SIZE = 1000;

export async function upsertInBatches<T>(
  table: string,
  rows: T[],
  onConflict: string,
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<number> {
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    const { error } = await supabase
      .from(table)
      .upsert(batch, {
        onConflict,
      });

    if (error) {
      throw error;
    }

    inserted += batch.length;

    console.log(
      `✓ ${table}: ${inserted}/${rows.length}`,
    );
  }

  return inserted;
}