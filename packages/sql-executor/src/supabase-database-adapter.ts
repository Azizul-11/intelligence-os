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

console.log("Calling run_sql RPC...");

const { data, error } = await this.supabase.rpc("run_sql", {
  query: normalizedSql,
});

console.log("RPC returned.");
console.log("Data:", data);
console.log("Error:", error);

if (error) {
  console.error("run_sql failed:", error);
  throw error;
}

return (data ?? []) as T[];
  }
}
