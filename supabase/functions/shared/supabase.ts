import { createClient } from "@supabase/supabase-js";
import { env } from "./env.ts";


export const supabase = createClient(
  env.supabase.url,
  env.supabase.secretKey,
);
console.log("SUPABASE URL:", env.supabase.url);