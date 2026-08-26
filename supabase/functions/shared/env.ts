function requireEnv(name: string): string {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

console.log("===== ENV CHECK =====");

console.log(
  "SUPABASE_URL =",
  Deno.env.get("SUPABASE_URL"),
);

console.log(
  "SUPABASE_SERVICE_ROLE_KEY exists =",
  !!Deno.env.get(
    "SUPABASE_SERVICE_ROLE_KEY",
  ),
);

console.log("=====================");
const env = {
  supabase: {
    url: requireEnv("SUPABASE_URL"),
    anonKey: requireEnv("SUPABASE_ANON_KEY"),
    serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  },
  llm: {
    groqApiKey: requireEnv("GROQ_API_KEY"),
    openaiApiKey: Deno.env.get("OPENAI_API_KEY") ?? "",
    anthropicApiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "",
  },
} as const;
export { env };