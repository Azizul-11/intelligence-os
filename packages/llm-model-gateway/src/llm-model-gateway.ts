/**
 * LLM-ModelGateway — the ONE file in the repository allowed to name a
 * vendor, a model, an API base URL, or a vendor-specific env var. Every
 * other package/file that needs an LLM call imports `llmGateway` from
 * here and calls one of its 3 bounded role methods
 * (normalizeMessyLanguage / synthesizeSuggestions / summarizeResult) -
 * never a provider SDK, never a raw fetch to a vendor endpoint.
 *
 * Single-Point-of-Configuration invariant: reordering providers,
 * swapping the primary vendor, or adding a new one is an edit to the
 * `FALLBACK_CHAIN` array below and nowhere else.
 *
 * Deterministic warehouse data remains the sole source of analytical
 * truth (Master Vision Guardrails 7-9, Phase 12). This gateway never
 * writes or executes SQL, never becomes the analytical source of truth -
 * it only rewrites messy input (Layer 1), rephrases already-decided
 * suggestion facts (Layer 2), or restates already-fetched rows (Layer 3).
 * Every one of those outputs is re-validated by deterministic code
 * before it can ever be trusted - see the 3 role methods' own doc
 * comments and the callers in create-runtime-engine.ts,
 * suggestion-generator.ts, and chat.ts.
 *
 * See docs/LLM-ModelGateway/ for the full audit, research, and design
 * this implementation follows.
 */

// ============================================================================
// §1 — Provider contract
// ============================================================================

/**
 * Master LLM Audit (2026-09-15): per-call sampling controls. Different
 * roles need different determinism/creativity tradeoffs (canonicalizing
 * messy input must be near-deterministic; suggesting varied follow-up
 * questions must not be) - a single fixed `temperature: 0.9` for every
 * role method was itself a root cause of Bug L's non-determinism (the
 * same "goverment hospital in CA" input producing a correct result on
 * one call and a silently-wrong one on the next). Per OpenAI's own
 * guidance, only one of temperature/topP should be tuned away from
 * "unset" at a time for a given call - callers here always set
 * `temperature` and leave `topP` unset unless they specifically need to
 * bound it, never both to a non-default value simultaneously.
 */
export interface SamplingOptions {
  temperature: number;
  topP?: number;
}

export interface LLMProvider {
  complete(systemPrompt: string, userMessage: string, options?: SamplingOptions): Promise<string>;
  completeJSON<T>(systemPrompt: string, userMessage: string, options?: SamplingOptions): Promise<T>;
}

export type ProviderKind =
  | "groq"
  | "google"
  | "openrouter"
  | "nvidia"
  | "openai"
  | "anthropic"
  | "cerebras"
  | "mistral"
  | "ollama"
  | "mock";

export interface ProviderConfig {
  provider: ProviderKind;
  model: string;
  apiKey?: string | undefined;
  endpoint?: string; // ollama (local) only
  baseURL?: string; // OpenAI-compatible base URL, when applicable
  timeoutMs: number;
  maxRetries: number;
  keyId: string; // human-readable id for logging/observability
  isFree: boolean; // descriptive metadata only, not behavioral
  stripReasoningTokens?: boolean; // true for reasoning-tuned models (NVIDIA Nemotron, OpenRouter Laguna/Nemotron)
}

// ============================================================================
// §2 — FALLBACK_CHAIN — the single source of truth for provider order.
// Confirmed against this repo's actual .env contents (see
// docs/LLM-ModelGateway/ARCHITECTURE_LLM_MODELGATEWAY.md §0):
//   - groq, google, openrouter, nvidia: real keys present today.
//   - openai, anthropic, cerebras, mistral: no key configured yet -
//     Graceful Unset Bypass (§6) skips these with zero network calls.
//   - ollama, mock (handled by role-level fallback, see §7): always
//     available, need no key.
// ============================================================================

export const FALLBACK_CHAIN: ProviderConfig[] = [
  // --- Groq (primary). LIVE-VERIFIED 2026-09-13 via GET
  // https://api.groq.com/openai/v1/models: "llama-3.3-70b-versatile" and
  // "llama-3.1-8b-instant" (this design's original assumption) both now
  // 404 "does not exist" - Groq's free catalog today is the open-weight
  // GPT-OSS family it hosts directly, not Llama. Using the two
  // confirmed-present, json_mode-capable models instead. ---
  { provider: "groq", model: "openai/gpt-oss-20b", apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1", timeoutMs: 3000, maxRetries: 2, keyId: "groq-gpt-oss-20b", isFree: true },
  { provider: "groq", model: "openai/gpt-oss-120b", apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1", timeoutMs: 4000, maxRetries: 1, keyId: "groq-gpt-oss-120b", isFree: true },
  // --- Extra Groq quota tier, added after live dogfooding exhausted the
  // 2 gpt-oss tiers' 1K-requests/day cap each (confirmed via this org's
  // own Groq console limits). "allam-2-7b" is a real general-purpose
  // chat-completion model (not a classifier) with a 7K-requests/day cap
  // - nearly 7x the headroom of either gpt-oss tier. Placed after both
  // gpt-oss tiers (they're still faster/more capable when available);
  // Zero-Stall 429 Failover means this only ever gets tried once both
  // are already exhausted or erroring, at no added latency cost when
  // they're healthy. ---
  { provider: "groq", model: "allam-2-7b", apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1", timeoutMs: 4000, maxRetries: 1, keyId: "groq-allam-2-7b", isFree: true },

  // --- Google Gemini. LIVE-VERIFIED 2026-09-13: "gemini-2.0-flash" and
  // "gemini-1.5-flash" (this design's original assumption) both now 404
  // - Google's own error response explicitly names the current
  // replacement model, used here directly rather than guessed. ---
  { provider: "google", model: "gemini-3.6-flash", apiKey: process.env.GOOGLE_API_KEY, timeoutMs: 4000, maxRetries: 2, keyId: "google-3.6-flash", isFree: true },

  // --- OpenRouter — ONE real key confirmed in .env today (not two -
  // the design's original "meta-llama/...instruct:free" entries are
  // confirmed gone from OpenRouter's free catalog as of 2026-09-13 (404
  // "unavailable for free"); replaced with models LIVE-CONFIRMED present
  // via GET https://openrouter.ai/api/v1/models - "laguna-s-2.1:free" is
  // also confirmed WORKING end-to-end by this package's own live smoke
  // test (scripts/verify-llm-gateway.ts). ---
  { provider: "openrouter", model: "poolside/laguna-s-2.1:free", apiKey: process.env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1", timeoutMs: 6000, maxRetries: 2, keyId: "openrouter-key1-laguna-s", isFree: true, stripReasoningTokens: true },
  { provider: "openrouter", model: "poolside/laguna-xs-2.1:free", apiKey: process.env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1", timeoutMs: 5000, maxRetries: 1, keyId: "openrouter-key1-laguna-xs", isFree: true, stripReasoningTokens: true },
  { provider: "openrouter", model: "nvidia/nemotron-3-super-120b-a12b:free", apiKey: process.env.OPENROUTER_API_KEY_2 || process.env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1", timeoutMs: 8000, maxRetries: 1, keyId: "openrouter-key2-nemotron-super", isFree: true, stripReasoningTokens: true },

  // --- NVIDIA NIM (direct) — OpenAI-compatible, free tier ~40 RPM
  // global cap. Reasoning model - stripReasoningTokens mandatory. ---
  { provider: "nvidia", model: "nvidia/nemotron-3-ultra-550b-a55b", apiKey: process.env.NVIDIA_API_KEY, baseURL: "https://integrate.api.nvidia.com/v1", timeoutMs: 15000, maxRetries: 1, keyId: "nvidia-direct-nemotron", isFree: true, stripReasoningTokens: true },

  // --- Future placeholders — confirmed ABSENT from .env today.
  // Graceful Unset Bypass (§6) skips these with zero network calls;
  // adding a key later activates them with zero code change. ---
  { provider: "openai", model: "gpt-4o-mini", apiKey: process.env.OPENAI_API_KEY, baseURL: "https://api.openai.com/v1", timeoutMs: 4000, maxRetries: 2, keyId: "openai-mini", isFree: false },
  { provider: "openai", model: "gpt-4o", apiKey: process.env.OPENAI_API_KEY, baseURL: "https://api.openai.com/v1", timeoutMs: 6000, maxRetries: 1, keyId: "openai-gpt4o", isFree: false },
  { provider: "anthropic", model: "claude-3-5-haiku-latest", apiKey: process.env.ANTHROPIC_API_KEY, timeoutMs: 4000, maxRetries: 2, keyId: "anthropic-haiku", isFree: false },
  { provider: "anthropic", model: "claude-3-5-sonnet-latest", apiKey: process.env.ANTHROPIC_API_KEY, timeoutMs: 6000, maxRetries: 1, keyId: "anthropic-sonnet", isFree: false },
  { provider: "cerebras", model: "llama-3.3-70b", apiKey: process.env.CEREBRAS_API_KEY, baseURL: "https://api.cerebras.ai/v1", timeoutMs: 3000, maxRetries: 2, keyId: "cerebras-70b", isFree: true },
  { provider: "mistral", model: "mistral-large-latest", apiKey: process.env.MISTRAL_API_KEY, baseURL: "https://api.mistral.ai/v1", timeoutMs: 5000, maxRetries: 1, keyId: "mistral-large", isFree: false },

  // --- Local, always available when running. ---
  { provider: "ollama", model: "llama3", endpoint: process.env.OLLAMA_ENDPOINT ?? "http://localhost:11434", timeoutMs: 8000, maxRetries: 1, keyId: "ollama-local", isFree: true },

  // --- Zero-dependency deterministic tier. `callMock` always throws
  // immediately (a mock provider cannot itself produce a role-correct
  // answer, since it has no knowledge of which of the 3 bounded roles
  // is calling) - reaching this tier means every real provider is
  // unavailable, at which point runChain's own caller (one of the 3
  // role methods in LLMModelGateway) applies ITS OWN documented
  // deterministic fallback (see normalizeMessyLanguage/
  // synthesizeSuggestions/summarizeResult's own doc comments) rather
  // than this generic tier guessing a shape. This entry exists so the
  // chain is provably total (every traversal terminates) and so it
  // appears in fallback-event logs for observability parity with the
  // approved design, even though its own adapter is a deliberate no-op.
  { provider: "mock", model: "deterministic-fallback", timeoutMs: 0, maxRetries: 0, keyId: "mock-deterministic", isFree: true },
];

// ============================================================================
// §3 — Response sanitization: reasoning-token stripping + JSON extraction
// ============================================================================

/**
 * Strips <thought>/<think> blocks some reasoning-tuned free models (NVIDIA
 * Nemotron, OpenRouter Laguna/Nemotron) inline into their content field,
 * per NVIDIA NIM's own documented "Thinking Budget Control" behavior.
 * Applied BEFORE json extraction/schema validation.
 */
function stripReasoning(text: string): string {
  return text
    .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
}

/**
 * Extracts a clean JSON object/array from a completion that may be
 * wrapped in markdown code fences or preceded/followed by prose - a
 * defensive boundary stripper run before JSON.parse(), since not every
 * free-tier model reliably returns bare JSON even when explicitly asked.
 */
function extractJsonBoundary(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1]! : text;
  const trimmed = candidate.trim();
  const firstBrace = Math.min(
    ...[trimmed.indexOf("{"), trimmed.indexOf("[")].filter((i) => i >= 0),
  );
  if (!Number.isFinite(firstBrace) || firstBrace < 0) {
    return trimmed;
  }
  const lastBrace = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
  if (lastBrace < firstBrace) {
    return trimmed;
  }
  return trimmed.slice(firstBrace, lastBrace + 1);
}

// ============================================================================
// §4 — Per-provider adapters. Private to this file - the only way to
// reach any vendor is through the failover loop in §7.
// ============================================================================

interface AdapterResult {
  content: string;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

class RateLimitedError extends Error {
  constructor(public readonly status: number) {
    super(`rate limited or overloaded (HTTP ${status})`);
  }
}

/**
 * Shared by every OpenAI-compatible provider (Groq, NVIDIA, OpenRouter,
 * OpenAI, Cerebras, Mistral) - these 6 vendors all accept the same
 * /chat/completions request/response shape against a different
 * baseURL, per RESEARCH_LLM_MODELGATEWAY.md §1.
 */
async function callOpenAICompatible(
  config: ProviderConfig,
  systemPrompt: string,
  userMessage: string,
  sampling: SamplingOptions,
): Promise<AdapterResult> {
  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: sampling.temperature,
      ...(sampling.topP !== undefined ? { top_p: sampling.topP } : {}),
    }),
  });

  if (response.status === 429 || response.status === 503) {
    throw new RateLimitedError(response.status);
  }
  if (!response.ok) {
    throw new Error(`${config.provider} HTTP ${response.status}: ${await response.text()}`);
  }

  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error(`${config.provider} returned no completion content`);
  }
  return { content };
}

async function callGoogle(
  config: ProviderConfig,
  systemPrompt: string,
  userMessage: string,
  sampling: SamplingOptions,
): Promise<AdapterResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
      generationConfig: {
        temperature: sampling.temperature,
        ...(sampling.topP !== undefined ? { topP: sampling.topP } : {}),
      },
    }),
  });

  if (response.status === 429 || response.status === 503) {
    throw new RateLimitedError(response.status);
  }
  if (!response.ok) {
    throw new Error(`google HTTP ${response.status}: ${await response.text()}`);
  }

  const body = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const content = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof content !== "string") {
    throw new Error("google returned no completion content");
  }
  return { content };
}

async function callAnthropic(
  config: ProviderConfig,
  systemPrompt: string,
  userMessage: string,
  sampling: SamplingOptions,
): Promise<AdapterResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      temperature: sampling.temperature,
      ...(sampling.topP !== undefined ? { top_p: sampling.topP } : {}),
    }),
  });

  if (response.status === 429 || response.status === 503) {
    throw new RateLimitedError(response.status);
  }
  if (!response.ok) {
    throw new Error(`anthropic HTTP ${response.status}: ${await response.text()}`);
  }

  const body = (await response.json()) as { content?: { text?: string }[] };
  const content = body.content?.[0]?.text;
  if (typeof content !== "string") {
    throw new Error("anthropic returned no completion content");
  }
  return { content };
}

async function callOllama(
  config: ProviderConfig,
  systemPrompt: string,
  userMessage: string,
  sampling: SamplingOptions,
): Promise<AdapterResult> {
  const response = await fetch(`${config.endpoint}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      stream: false,
      options: {
        temperature: sampling.temperature,
        ...(sampling.topP !== undefined ? { top_p: sampling.topP } : {}),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`ollama HTTP ${response.status}: ${await response.text()}`);
  }

  const body = (await response.json()) as { message?: { content?: string } };
  const content = body.message?.content;
  if (typeof content !== "string") {
    throw new Error("ollama returned no completion content");
  }
  return { content };
}

/** See the `mock` FALLBACK_CHAIN entry's own doc comment for why this always throws. */
async function callMock(): Promise<AdapterResult> {
  throw new Error("mock tier reached - every real provider is unavailable");
}

async function callAdapter(
  config: ProviderConfig,
  systemPrompt: string,
  userMessage: string,
  sampling: SamplingOptions,
): Promise<AdapterResult> {
  switch (config.provider) {
    case "groq":
    case "nvidia":
    case "openrouter":
    case "openai":
    case "cerebras":
    case "mistral":
      return callOpenAICompatible(config, systemPrompt, userMessage, sampling);
    case "google":
      return callGoogle(config, systemPrompt, userMessage, sampling);
    case "anthropic":
      return callAnthropic(config, systemPrompt, userMessage, sampling);
    case "ollama":
      return callOllama(config, systemPrompt, userMessage, sampling);
    case "mock":
      return callMock();
  }
}

// ============================================================================
// §5 — Circuit breaker (per-provider, in-memory, private to this file)
// ============================================================================

interface CircuitState {
  state: "closed" | "open" | "half-open";
  failureCount: number;
  openedAt: number;
}

const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 30_000;

const circuits = new Map<ProviderKind, CircuitState>();

function circuitFor(provider: ProviderKind): CircuitState {
  let circuit = circuits.get(provider);
  if (!circuit) {
    circuit = { state: "closed", failureCount: 0, openedAt: 0 };
    circuits.set(provider, circuit);
  }
  return circuit;
}

function isCircuitOpen(provider: ProviderKind): boolean {
  const circuit = circuitFor(provider);
  if (circuit.state !== "open") {
    return false;
  }
  if (Date.now() - circuit.openedAt >= CIRCUIT_COOLDOWN_MS) {
    circuit.state = "half-open";
    return false; // allow exactly one probe through
  }
  return true;
}

function recordSuccess(provider: ProviderKind): void {
  circuits.set(provider, { state: "closed", failureCount: 0, openedAt: 0 });
}

function recordFailure(provider: ProviderKind): void {
  const circuit = circuitFor(provider);
  circuit.failureCount += 1;
  if (circuit.state === "half-open" || circuit.failureCount >= CIRCUIT_FAILURE_THRESHOLD) {
    circuit.state = "open";
    circuit.openedAt = Date.now();
  }
}

// ============================================================================
// §6 — Observability
// ============================================================================

function logFallbackEvent(keyId: string, reason: string, error: unknown): void {
  console.error(
    JSON.stringify({
      component: "llm-model-gateway",
      keyId,
      reason,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }),
  );
}

// ============================================================================
// §7 — The failover loop, shared by complete()/completeJSON()
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runChain(
  chain: ProviderConfig[],
  systemPrompt: string,
  userMessage: string,
  sampling: SamplingOptions,
): Promise<string> {
  for (const config of chain) {
    // Graceful Unset Bypass: a tier with no configured key (ollama and
    // mock excepted - neither needs one) is skipped BEFORE any network
    // call is constructed - zero HTTP overhead, not a caught error.
    if (!config.apiKey && config.provider !== "ollama" && config.provider !== "mock") {
      continue;
    }
    if (isCircuitOpen(config.provider)) {
      continue;
    }

    let attempt = 0;
    // maxRetries applies only to non-rate-limit errors (see below) -
    // Zero-Stall 429 Failover means a 429/503 never retries in place.
    while (attempt <= config.maxRetries) {
      try {
        const result = await withTimeout(
          callAdapter(config, systemPrompt, userMessage, sampling),
          config.timeoutMs,
        );
        recordSuccess(config.provider);
        const raw = config.stripReasoningTokens ? stripReasoning(result.content) : result.content;
        return raw;
      } catch (error) {
        if (error instanceof RateLimitedError) {
          recordFailure(config.provider);
          logFallbackEvent(config.keyId, "429/503 - zero-stall failover, no retry", error);
          break; // advance to next tier immediately, no retry
        }
        attempt += 1;
        if (attempt > config.maxRetries) {
          recordFailure(config.provider);
          logFallbackEvent(config.keyId, "exhausted retries", error);
          break;
        }
        // exponential backoff with jitter before retrying this same tier
        await sleep(2 ** attempt * 100 + Math.random() * 100);
      }
    }
  }

  throw new Error("all configured LLM providers failed or were unavailable");
}

// ============================================================================
// §8 — LLMModelGateway: the 3 bounded role methods everything else calls
// ============================================================================

export interface MessyLanguageResult {
  status: "ok" | "need_clarification" | "fallback";
  canonical_question?: string;
  reason?: string;
}

/**
 * PrePhase 9.5: a generic, duck-typed capability manifest - deliberately
 * NOT imported from any Domain pack (this package stays a sibling of
 * Universal Core, never a consumer of a specific domain). Every caller
 * (the orchestrator, a Domain-owned suggestion generator) passes its own
 * domain's catalog in this shape; the gateway only ever quotes it back
 * into a prompt, never invents beyond it.
 */
export interface CapabilityCatalog {
  metrics: { displayName: string; description?: string }[];
  states: string[];
  ownerships: string[];
  /** PrePhase 9.5 Round 2: condition-specific concepts (AMI, CABG, etc.) with their own real, already-registered simple-language aliases. Optional - a caller that omits it (pre-Round-2 shape) is unaffected. */
  concepts?: { displayName: string; aliases: string[]; metrics: string[] }[];
  exampleAnswerableQuestions: string[];
  nonAnswerableExamples: string[];
}

/**
 * Renders a capability catalog into prompt text. Without one (the
 * pre-PrePhase-9.5 call shape, kept working for backward compatibility),
 * falls back to the original short hardcoded metric list - a real but
 * narrower prompt, exactly what this design's own audit identified as
 * the root cause of "the LLM doesn't know what the platform can do."
 */
function describeCapabilities(capabilities?: CapabilityCatalog): string {
  if (!capabilities) {
    return "You may ONLY use these exact metric display names: Hospital Overall Rating, Mortality Rate, Readmission Rate, Patient Experience, Safety Performance, AMI Mortality, CABG Readmission, COPD Mortality, Heart Failure Mortality, Hip-Knee Readmission, Pneumonia Mortality.";
  }
  const metricLines = capabilities.metrics
    .map((m) => `${m.displayName}${m.description ? ` (${m.description})` : ""}`)
    .join("; ");
  const conceptLines = (capabilities.concepts ?? [])
    .map((c) => `${c.displayName} (say any of: ${c.aliases.join(", ")}; supports ${c.metrics.join(" and ")})`)
    .join("; ");
  return [
    `You may ONLY use these exact metric display names: ${metricLines}.`,
    `You may reference any of these US states if the user's question names one: ${capabilities.states.join(", ")}.`,
    `You may reference any of these ownership categories: ${capabilities.ownerships.join(", ")}.`,
    conceptLines
      ? `You may also reference these clinical conditions (use ONLY the exact display name shown, never invent your own condition name): ${conceptLines}.`
      : "",
    `Example questions this platform CAN answer: ${capabilities.exampleAnswerableQuestions.join(" | ")}.`,
    `This platform CANNOT answer general knowledge, weather, or non-healthcare-analytics questions, e.g.: ${capabilities.nonAnswerableExamples.join(", ")}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Tier1 T6 successor: same shape SuggestionContext-derived candidates
 * already carry - kept generic/duck-typed here (not imported from
 * @intelligence/domain-sdk) so this package stays a zero-dependency
 * sibling of Universal Core, never a consumer of it.
 */
export interface SuggestionPromptContext {
  question: string;
  resolvedMetric?: string | undefined;
  resolvedState?: string | undefined;
  candidates: string[];
}

export class LLMModelGateway implements LLMProvider {
  constructor(private readonly chain: ProviderConfig[] = FALLBACK_CHAIN) {}

  async complete(
    systemPrompt: string,
    userMessage: string,
    options: SamplingOptions = { temperature: 0.9 },
  ): Promise<string> {
    return runChain(this.chain, systemPrompt, userMessage, options);
  }

  async completeJSON<T>(
    systemPrompt: string,
    userMessage: string,
    options: SamplingOptions = { temperature: 0.9 },
  ): Promise<T> {
    const raw = await runChain(this.chain, systemPrompt, userMessage, options);
    return JSON.parse(extractJsonBoundary(raw)) as T;
  }

  /**
   * Layer 1 (Messy Input Normalizer). Returns a canonical rewrite of the
   * user's question, bounded to declared capabilities - NEVER trusted as
   * answerable on its own. The caller (create-runtime-engine.ts) must
   * re-run the exact same semantic.resolve() pipeline on
   * `canonical_question` before treating it as anything more than a
   * candidate input string. On any gateway failure, returns
   * {status:"fallback"} - the caller's own existing dead-end handling
   * (SAFE_FALLBACK_SUGGESTIONS) takes over, never a crash.
   */
  async normalizeMessyLanguage(question: string, capabilities?: CapabilityCatalog): Promise<MessyLanguageResult> {
    const systemPrompt = [
      "You rewrite unclear healthcare-analytics questions into one canonical supported question.",
      
      "TYPO HANDLING - Be generous, preserve filters:",
      "'safty performence' or 'saftey performence' or 'saftey' or 'saftey performance' means Safety Performance.",
      "'good saftey' or 'good safety' means best Safety Performance - ranking - no state needed - good = best/top/highest.",
      "Ownership typos: 'goverment' or 'govt' or 'gov' or 'govenment' means government - preserve ownership filter - never drop ownership word even with typo.",
      "'non profit' or 'nonprofit' means non-profit, 'voluntary non profit' means voluntary non-profit, 'for profit' or 'forprofit' means for-profit.",
      "'3 star' means Hospital Overall Rating of 3, 'heart care'/'heart attack dead' means Mortality Rate.",
      "CRITICAL: Preserve ALL filters - if original has ownership word (government, non-profit, voluntary non-profit, for-profit, etc.) even with typo, canonical_question MUST keep that ownership word (corrected) - never drop ownership or state when present in original.",
      
      "STATE HANDLING - Always expand to full state name - exhaustive map - never leave an abbreviation in canonical_question:",
      "Abbreviations: 'AL' means Alabama, 'AK' means Alaska, 'AZ' means Arizona, 'AR' means Arkansas, 'CA' or 'cali' or 'calif' means California, 'CO' means Colorado, 'CT' means Connecticut, 'DE' means Delaware, 'FL' or 'fla' means Florida, 'GA' means Georgia, 'HI' means Hawaii, 'ID' means Idaho, 'IL' means Illinois, 'IN' means Indiana, 'IA' means Iowa, 'KS' means Kansas, 'KY' means Kentucky, 'LA' means Louisiana, 'ME' means Maine, 'MD' means Maryland, 'MA' means Massachusetts, 'MI' means Michigan, 'MN' means Minnesota, 'MS' means Mississippi, 'MO' means Missouri, 'MT' means Montana, 'NE' means Nebraska, 'NV' means Nevada, 'NH' means New Hampshire, 'NJ' means New Jersey, 'NM' means New Mexico, 'NY' means New York, 'NC' means North Carolina, 'ND' means North Dakota, 'OH' means Ohio, 'OK' means Oklahoma, 'OR' means Oregon, 'PA' means Pennsylvania, 'RI' means Rhode Island, 'SC' means South Carolina, 'SD' means South Dakota, 'TN' means Tennessee, 'TX' or 'tex' means Texas, 'UT' means Utah, 'VT' means Vermont, 'VA' means Virginia, 'WA' means Washington, 'WV' means West Virginia, 'WI' means Wisconsin, 'WY' means Wyoming.",
      "'CA' never means Canada in this healthcare context - always California. Every two-letter code above, written in ALL CAPS, immediately next to the word 'hospital'/'hospitals' or after 'in', is a US state code in this context, never an ordinary English word (e.g. 'hospital in IN' or 'hospitals IN' means Indiana, not the preposition) - lowercase 'in' used as an ordinary preposition (e.g. 'hospitals in California') is never a state code.",
      "Lowercase: 'california' means California, 'texas' means Texas - normalize case to full proper case in canonical_question.",
      "Informal: 'cali' means California, 'tex' means Texas, 'fla' means Florida, etc. - expand informal short forms too.",
      "Always expand any abbreviation or informal short form to the full, proper-case state name in canonical_question - never leave 'CA'/'TX'/'cali'/'tex' etc. in the output.",

      "GEOGRAPHIC LIST WITHOUT METRIC - a state alone, no metric named, is a complete, answerable request - never ask for clarification when a state is already present:",
      "'hospital in CA' or 'hospitals in CA' or 'show me hospital in CA' or 'show me hospitals in CA' means 'Show me hospitals in California' - status ok, no metric needed, this is a real geographic list capability.",
      "'hospital in TX' means 'Show me hospitals in Texas'. Any bare '<location word> in <state abbreviation/informal/full name>' with no ownership/metric word follows the same pattern - expand the state, keep the shape 'Show me hospitals in <State>'.",

      "COMBINATION HANDLING - Two or more errors at once - correct ALL of them, drop none:",
      "When a question has both a typo AND a state abbreviation (e.g. 'goverment hospital in CA'), correct BOTH in the same canonical_question - normalize the typo AND expand the abbreviation - never fix one while silently dropping the other. Example: 'goverment hospital in CA' -> 'Show me government hospitals in California' (NOT 'Show me government hospitals' with California dropped, and NOT 'Show me hospitals in California' with government dropped - both of those are wrong, incomplete rewrites).",

      "OWNERSHIP + STATE IMPLIES RANKING - Preserve intent, never substitute a different filter:",
      "'government hospital in California' or 'goverment hospital in CA' implies ranking - canonical should be 'Show me government hospitals in California' - preserve government filter and state - will be ranked by overall rating (10 rows) not full state list (100 rows).",
      "Never change 'government hospital' to '5-star hospital' or 'best hospital' - ownership is different from rating - preserve ownership word - don't invent rating when ownership asked.",

      "RANKING SYNONYMS - good/bad handling - Critical for safety cases:",
      "'good' or 'great' or 'excellent' means 'best' or 'top' or 'highest' - ranking - e.g. 'good safety' means 'best Safety Performance' or 'highest Safety Performance' - ranking, no state needed.",
      "'bad' or 'poor' or 'worst' means 'worst' or 'lowest' - ranking.",
      "So 'show me hospital with good safety' → 'Show me hospitals with best Safety Performance' - status ok, no state needed, ranking.",
      "'show me hospital with good saftey' (typo) → 'Show me hospitals with best Safety Performance' - correct typo saftey → safety AND good → best.",
      "'hospital with good rating' → 'hospitals with best Hospital Overall Rating'.",
      "'hospital with good mortality' → 'hospitals with lowest Mortality Rate' - because lower is better for mortality - but good still implies ranking.",
      "This fixes: 'Which hospitals rank highest in Safety Performance' already works, but 'good safety' should also work without state.",

      "NEGATIVE EXAMPLES - what NOT to do - never produce these:",
      "Wrong: 'goverment hospital in CA' -> 'Show me 5-star hospitals in California' (ownership silently dropped, an unrelated rating invented instead - never invent a different filter than what was asked).",
      "Wrong: 'goverment hospital in CA' -> 'Show me government hospitals' (California silently dropped - state must be preserved once present in the original).",
      "Wrong: 'goverment hospital in CA' -> 'Show me hospitals in California' (government ownership silently dropped - this exact mistake previously caused a real, live bug: an all-ownership nationwide-scoped result presented as if it were California-only government hospitals).",
      "Wrong: inventing a state when none was named and no ranking word was given either - return status \"need_clarification\" instead.",
      "Wrong: treating 'CA' as Canada, or as anything other than California, in this healthcare context.",

      "FEW-SHOT EXAMPLES - Input → Output - Cover edge combos so this does not need to be re-fixed for the next typo/short-form variant:",
      "Input: 'goverment hospital in CA' → Output: status ok, canonical_question 'Show me government hospitals in California'.",
      "Input: 'goverment hospital in california' → Output: 'Show me government hospitals in California'.",
      "Input: 'government hospital in CA' → Output: 'Show me government hospitals in California'.",
      "Input: 'govt hospital in CA' → Output: 'Show me government hospitals in California'.",
      "Input: 'gov hospital CA' → Output: 'Show me government hospitals in California'.",
      "Input: 'government hospital in Cali' → Output: 'Show me government hospitals in California'.",
      "Input: 'goverment hospital TX' → Output: 'Show me government hospitals in Texas'.",
      "Input: 'non profit hospital in CA' → Output: 'Show me non-profit hospitals in California'.",
      "Input: 'hospital in CA' → Output: status ok, canonical_question 'Show me hospitals in California' - no metric needed, state alone is a complete request.",
      "Input: 'show me hospital in CA' → Output: 'Show me hospitals in California'.",
      "Input: 'hospitals in CA' → Output: 'Show me hospitals in California'.",
      "Input: 'hospital in TX' → Output: 'Show me hospitals in Texas'.",
      "Input: 'show me hospital with good safety' → Output: status ok, canonical_question 'Show me hospitals with best Safety Performance' - no state needed, good → best, safety → Safety Performance, ranking.",
      "Input: 'show me hospital with good saftey' → Output: 'Show me hospitals with best Safety Performance' - typo saftey → safety + good → best.",
      "Input: 'hospital with good safety performance' → Output: 'Show me hospitals with best Safety Performance'.",
      "Input: 'which hospitals have good safety?' → Output: 'Show me hospitals with best Safety Performance'.",
      "Input: 'good safety hospitals' → Output: 'Show me hospitals with best Safety Performance'.",
      "Input: 'good safety' → Output: 'Show me hospitals with best Safety Performance'.",
      "Input: 'best safety' → Output: 'Show me hospitals with best Safety Performance' - here the LLM rewrite itself supplies the missing word 'Performance', a different mechanism than a bare-phrase deterministic alias match.",
      "Input: 'Which hospitals rank highest in Safety Performance?' → Output: 'Show me hospitals with highest Safety Performance' - already works but include as positive example.",
      "Input: 'Which hospitals have the lowest mortality rates?' → Output: 'Show me hospitals with lowest Mortality Rate' - positive control, unrelated to typos/states, must keep working exactly as-is.",

      describeCapabilities(capabilities),
      'You must NEVER invent a metric, hospital name, or condition not in the list above. If the',
      'question cannot be mapped to any of these metrics, return status "fallback". If it is',
      'ambiguous between two metrics, return status "need_clarification" with a reason.',
      'canonical_question must always be a full question of the shape "Show me hospitals with',
      '<best/top/highest/lowest/worst> <metric>" (optionally "in <state>") - NEVER just the bare',
      "metric name alone (e.g. never just \"Safety Performance\" by itself).",
      "A plain filter/list request for a metric (e.g. a specific star rating, or a bare metric name",
      "with no ranking word like best/top/highest/lowest/worst/good/great/excellent/bad/poor) requires a named state to run - never invent or default a state that",
      'was not in the original question. If the original question has no state AND no ranking',
      'word (including good/great/excellent/bad/poor), return status "need_clarification"',
      "asking which state, instead of guessing status \"ok\" with a still-unscoped canonical_question.",
      'If the question already implies ranking ("best", "top", "worst", "good", "great", "excellent", etc.) it does not need a',
      "state and can be returned as status \"ok\" as-is.",
      "EXCEPTION for clinical conditions: if the question names one of the clinical conditions listed",
      "above (heart attack, bypass surgery, COPD, heart failure, pneumonia, hip/knee, etc.) with NO",
      'ranking word, default the ranking to "lowest" yourself (a lower rate is always the better',
      "outcome for these condition-specific measures) instead of asking for a state - a bare",
      'condition name alone is always intended as a ranking request, never a plain filter/list, so it',
      'never needs a state either. Example: "bypass surgery readmission" -> "Show me hospitals with',
      'lowest CABG Readmission" (status "ok", no state, no clarification needed).',
      "Return ONLY this JSON shape, nothing else:",
      '{"status": "ok" | "need_clarification" | "fallback", "canonical_question": string | null, "reason": string | null}',
    ].join(" ");

    try {
      // Master LLM Audit: canonicalization is a factual/deterministic-shaped
      // task (typo correction, alias expansion), not a creative one - a
      // low temperature makes the same input produce the same rewrite
      // far more reliably. Confirmed live (Bug L) that the previous
      // shared temperature 0.9 caused the identical "goverment hospital
      // in CA" input to sometimes drop the ownership filter and
      // sometimes not, across separate calls with no code change.
      const result = await this.completeJSON<MessyLanguageResult>(systemPrompt, question, { temperature: 0.1 });
      if (result && (result.status === "ok" || result.status === "need_clarification" || result.status === "fallback")) {
        return result;
      }
      return { status: "fallback", reason: "malformed gateway response" };
    } catch (error) {
      logFallbackEvent("normalizeMessyLanguage", "all providers exhausted", error);
      return { status: "fallback", reason: "LLM gateway unavailable" };
    }
  }

  /**
   * Layer 2 (Suggestion Co-Pilot). Rephrases (never re-chooses) an
   * already-decided candidate list for lexical variety. Returns the
   * SAME candidates unchanged on any failure/malformed response/length
   * mismatch - the caller's own dry-run validation still runs on
   * whatever this returns, so a bad rephrase costs nothing beyond one
   * dropped candidate at that call site, never a broken response.
   */
  async synthesizeSuggestions(context: SuggestionPromptContext): Promise<string[]> {
    if (context.candidates.length === 0) {
      return context.candidates;
    }

    const systemPrompt = [
      "You are a suggestion-phrasing assistant for a healthcare analytics platform.",
      "You will be given a list of already-decided, already-verified follow-up questions.",
      "Rephrase each one to sound more natural and varied - do NOT change which metric, state,",
      "hospital, or ownership category each one refers to. Do NOT add a new fact. Do NOT combine",
      "two suggestions into one. Do NOT invent any metric, hospital name, or place not already",
      "present in the input list. Return a JSON array of strings, same length and same order as",
      "the input, one rephrased line per input line.",
    ].join(" ");

    const userMessage = JSON.stringify({
      resolvedMetric: context.resolvedMetric,
      resolvedState: context.resolvedState,
      candidates: context.candidates,
    });

    try {
      // Master LLM Audit: medium temperature - enough lexical variety to
      // avoid robotic repeats, but this method must never invent a new
      // fact (only rephrase already-decided candidates), so it stays
      // well below the high end used for genuinely creative/diverse
      // suggestion generation (selectAndRephraseSuggestions).
      const result = await this.completeJSON<string[]>(systemPrompt, userMessage, { temperature: 0.6 });
      if (Array.isArray(result) && result.length === context.candidates.length && result.every((s) => typeof s === "string" && s.length > 0)) {
        return result;
      }
      return context.candidates;
    } catch (error) {
      logFallbackEvent("synthesizeSuggestions", "all providers exhausted", error);
      return context.candidates;
    }
  }

  /**
   * Layer 3 (Executive Answer Synthesis). Summarizes already-fetched
   * rows in 1-2 sentences. The CALLER (chat.ts) is responsible for the
   * mandatory numeric cross-check against `rows` before ever attaching
   * this to a response - this method only produces a candidate string,
   * it does not itself decide whether the string is trustworthy.
   * Returns an empty string on any failure - the caller must treat an
   * empty string identically to "no summary available".
   */
  async summarizeResult(question: string, rows: Record<string, unknown>[]): Promise<string> {
    if (rows.length === 0) {
      return "";
    }

    const systemPrompt = [
      "Summarize this table of real healthcare data in 1-2 sentences.",
      "You may ONLY state numbers, names, and values that literally appear in the JSON rows below.",
      "Never compute an average, a total, or any derived number yourself - only restate what a row",
      "already shows. Never state a fact about a hospital not present in the rows.",
      "Return plain text, not JSON.",
    ].join(" ");

    const userMessage = JSON.stringify({ question, rows: rows.slice(0, 20) });

    try {
      // Master LLM Audit: low temperature - this is a factual restatement
      // task (only numbers/names/values already present in `rows`), the
      // same class as summarization/factual-QA in the research this audit
      // is based on - a lower temperature reduces the chance of the kind
      // of narrative drift already observed elsewhere in this campaign
      // (e.g. a name-swap hallucination between two compared hospitals'
      // stats in an earlier dogfooding round).
      const summary = await this.complete(systemPrompt, userMessage, { temperature: 0.2 });
      return summary.trim();
    } catch (error) {
      logFallbackEvent("summarizeResult", "all providers exhausted", error);
      return "";
    }
  }

  /**
   * Layer 0 (Conversational Front-Door Router). ONLY ever called for
   * questions the caller has already classified as conversational
   * (greeting/meta-capability/off-topic) - never a substitute for Gate 1
   * semantic resolution. Never writes SQL, never invents a hospital,
   * never claims a capability the catalog doesn't list - it only
   * explains what the platform can do, in the caller-supplied
   * capability catalog's own vocabulary. On any failure, returns a
   * fixed, deterministic onboarding message plus the catalog's own
   * example questions - the Every-Turn Invariant holds even if every
   * provider is down.
   */
  async handleConversational(
    question: string,
    capabilities: CapabilityCatalog,
  ): Promise<{ answer: string; suggestions: string[] }> {
    const systemPrompt = [
      "You are IntelligenceOS, a healthcare analytics platform. A user just sent a casual message",
      "(greeting, a question about what you can do, or something off-topic) - NOT an analytical",
      "question. Respond warmly in 2-3 sentences, like ChatGPT/Claude's own onboarding tone, explaining",
      "what you can help with.",
      describeCapabilities(capabilities),
      // PrePhase 9.5 Round 3: previously restricted to only the fixed
      // 5-item example list, which made every conversational turn
      // suggest a near-identical set - widened to draw from the FULL
      // capability description just given (metrics, states, ownership
      // categories, clinical concepts), so repeated greetings surface
      // genuinely different, still-only-real questions instead of the
      // same handful reworded. Every suggestion is still dry-run
      // validated by the caller (chat.ts's validateConversationalSuggestions)
      // before ever being shown, so a less-common combination here is
      // exactly as safe as the fixed list was.
      "Suggest 3-4 concrete, varied example questions - combine a metric, a state, an ownership",
      "category, or a clinical concept from what's declared above, or use one from the platform's own",
      "example list - vary which ones you pick between turns rather than always the same set. Never",
      "invent a metric, state, ownership category, or condition not declared above.",
      'Return ONLY this JSON shape: {"answer": string, "suggestions": string[]}',
    ].join(" ");

    const fallback = {
      answer:
        "Hey! I'm IntelligenceOS, your healthcare analytics co-pilot. I can help you find the best hospitals by overall rating, safety, mortality, readmission, or patient experience, in any US state. Try one of these:",
      suggestions: capabilities.exampleAnswerableQuestions.slice(0, 4),
    };

    try {
      // Master LLM Audit: kept high (this method's shape needs a warm,
      // varied, non-repetitive onboarding tone across turns - a "normal
      // chatbot" task per the research this audit is based on, not a
      // factual/canonicalization one).
      const result = await this.completeJSON<{ answer?: string; suggestions?: string[] }>(systemPrompt, question, { temperature: 0.8 });
      if (
        typeof result?.answer === "string" &&
        result.answer.length > 0 &&
        Array.isArray(result.suggestions) &&
        result.suggestions.every((s) => typeof s === "string" && s.length > 0)
      ) {
        return { answer: result.answer, suggestions: result.suggestions.slice(0, 4) };
      }
      return fallback;
    } catch (error) {
      logFallbackEvent("handleConversational", "all providers exhausted", error);
      return fallback;
    }
  }

  /**
   * Layer 2, diversity mode (PrePhase 9.5). Given a POOL of already
   * mechanically-valid candidates (built by the Domain-owned generator
   * from its own comparable-metrics/peer-states/ownership/entity data -
   * never invented by the LLM), selects `count` of them for maximum
   * diversity across dimensions and rephrases each for natural wording.
   * Never selects anything outside the given pool, never combines two
   * pool entries into one, never invents a new fact. On any
   * failure/malformed/wrong-length response, falls back to the first
   * `count` pool entries unchanged - the caller's own dry-run validation
   * is what actually guarantees every returned suggestion is answerable.
   */
  async selectAndRephraseSuggestions(
    pool: string[],
    context: { resolvedMetric?: string | undefined; resolvedState?: string | undefined },
    count = 3,
  ): Promise<string[]> {
    const fallback = pool.slice(0, count);
    if (pool.length <= count) {
      return pool;
    }

    const systemPrompt = [
      "You are a suggestion selector for a healthcare analytics platform.",
      "You will be given a POOL of already-decided, already-verified follow-up questions - ALL are",
      "answerable. Your job: SELECT the most diverse and relevant ones, then rephrase each to sound",
      "natural. Diversity means covering different dimensions (a different metric, a different",
      "state/ownership, an entity-specific question) - do not select several that all differ only in",
      "wording, not in fact. Do NOT invent a new fact, do NOT combine two pool items into one, do NOT",
      "select or invent anything outside the given pool.",
      `Return a JSON array of exactly ${count} rephrased strings, each corresponding to one selected pool item.`,
    ].join(" ");

    const userMessage = JSON.stringify({
      resolvedMetric: context.resolvedMetric,
      resolvedState: context.resolvedState,
      pool,
      numberToSelect: count,
    });

    try {
      // Master LLM Audit: kept high - this is the brainstorming/diversity
      // task (research: 0.7-1.1 best creativity-to-cost ratio for idea
      // generation) - a low temperature here would defeat the entire
      // point of this method (avoiding repetitive, formulaic suggestions).
      const result = await this.completeJSON<string[]>(systemPrompt, userMessage, { temperature: 0.8 });
      if (Array.isArray(result) && result.length === count && result.every((s) => typeof s === "string" && s.length > 0)) {
        return result;
      }
      return fallback;
    } catch (error) {
      logFallbackEvent("selectAndRephraseSuggestions", "all providers exhausted", error);
      return fallback;
    }
  }
}

export const llmGateway = new LLMModelGateway();
