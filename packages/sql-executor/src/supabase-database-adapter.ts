import { createClient } from "@supabase/supabase-js";
import type { DatabaseAdapter } from "./database-adapter";

import type { SupabaseClient } from "@supabase/supabase-js";

export class SupabaseDatabaseAdapter implements DatabaseAdapter {
  constructor(private readonly supabase: SupabaseClient) {}

  async execute<T = unknown>(
    sql: string,
    _parameters: Record<string, unknown>,
  ): Promise<T[]> {
    console.log("========== SQL ==========");
    console.log(sql);
    console.log("=========================");
    const normalizedSql = sql.trim().replace(/;\s*$/, "");
    const { data, error } = await this.supabase.rpc("run_sql", {
      query: normalizedSql,
    });

    if (error) {
      throw error;
    }

    return (data ?? []) as T[];
  }
}
