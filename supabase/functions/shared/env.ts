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
    url: "https://uejnblmhappddtbablki.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlam5ibG1oYXBwZGR0YmFibGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NDYxNDgsImV4cCI6MjA5NjQyMjE0OH0.tCglCuuehpQYtpQwVmUKOYQb6gg55tb8n-oMtJTLiyA",
    serviceRoleKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlam5ibG1oYXBwZGR0YmFibGtpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDg0NjE0OCwiZXhwIjoyMDk2NDIyMTQ4fQ.q4mNBHcpNZUGtaGdln0xBpAKWRGEXmWZ5vRon8v61lI",
  },
  llm: {
    groqApiKey: requireEnv("GROQ_API_KEY"),
    openaiApiKey: Deno.env.get("OPENAI_API_KEY") ?? "",
    anthropicApiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "",
  },
} as const;
export { env };