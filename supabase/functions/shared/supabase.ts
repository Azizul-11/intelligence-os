import { createClient } from "@supabase/supabase-js";
import { env } from "./env.ts";

export const supabase = createClient(
  env.supabase.url,
  env.supabase.serviceRoleKey,
);