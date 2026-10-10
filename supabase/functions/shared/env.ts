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
  "ORCHESTRATOR_SECRET_KEY exists =",
  !!Deno.env.get(
    "ORCHESTRATOR_SECRET_KEY",
  ),
);

console.log("=====================");
const env = {
  supabase: {
    url: requireEnv("SUPABASE_URL"),
    // The sb_secret_ key, set with `supabase secrets set`; the legacy keys are disabled.
    secretKey: requireEnv("ORCHESTRATOR_SECRET_KEY"),
  },
  llm: {
    groqApiKey: requireEnv("GROQ_API_KEY"),
    openaiApiKey: Deno.env.get("OPENAI_API_KEY") ?? "",
    anthropicApiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "",
  },
} as const;
export { env };