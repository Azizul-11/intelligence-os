
import { hospitalOverallRatingSqlTemplate } from "@intelligence/healthcare-domain";
import { SqlExecutor } from "./sql-executor";
import { SupabaseDatabaseAdapter } from "./supabase-database-adapter";
import { createClient } from "@supabase/supabase-js";

import dotenv from "dotenv";

const result = dotenv.config({ path: ".env" });

console.log(result);
console.log(process.cwd());
console.log(process.env.SUPABASE_URL);

import { env } from "../../../scripts/shared/env";

console.log("SUPABASE_URL =", process.env.SUPABASE_URL);
console.log("SERVICE_KEY =", !!process.env.SUPABASE_SERVICE_ROLE_KEY);


const supabase = createClient(
  env.supabaseUrl,
  env.supabaseServiceRoleKey,
);



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

  console.log("Execution Result:");
  console.dir(result, { depth: null });
}

main().catch(console.error);