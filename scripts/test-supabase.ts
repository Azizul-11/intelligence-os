import { supabase } from "./shared/supabase";

async function main() {
  const { error } = await supabase
    .from("warehouse_hospitals")
    .select("*")
    .limit(1);

  if (error) {
    console.error(error);
    process.exit(1);
  }

  console.log("✓ Connected to Supabase");
}

main();