import { SqlExecutor } from "../packages/sql-executor/src/sql-executor";
import { SupabaseDatabaseAdapter } from "../packages/sql-executor/src/supabase-database-adapter";
import { hospitalOverallRatingSqlTemplate } from "@intelligence/healthcare-domain";

import { supabase } from "./shared/supabase";

async function main() {
  const executor = new SqlExecutor(
    new SupabaseDatabaseAdapter(supabase),
  );

  const result = await executor.execute(
    hospitalOverallRatingSqlTemplate,
    {
      hospitalId: "010055",
    },
  );

  console.dir(result, { depth: null });
}

main().catch(console.error);