// import dotenv from "dotenv";

// Commented out: dotenv.config for .env.

// function getEnv(name: string): string {
//   const value = process.env[name];

// Commented out: getEnv throws on a missing variable.

//   return value;
// }

// Commented out: env export of SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY via getEnv.

import dotenv from "dotenv";

dotenv.config({
  path: ".env",
});

function getEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export const env = {
  supabaseUrl: getEnv("SUPABASE_URL"),
  supabaseAnonKey: getEnv("SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
};