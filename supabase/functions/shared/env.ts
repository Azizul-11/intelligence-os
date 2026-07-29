function requireEnv(name: string): string {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
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