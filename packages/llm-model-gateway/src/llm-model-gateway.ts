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

import { AsyncLocalStorage } from "node:async_hooks";

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
  /**
   * True when this call's output decides WHICH DATA THE USER IS SHOWN (the
   * question rewrite) - tiers flagged `unsafeForRewrite` are skipped for it.
   */
  forRewrite?: boolean;
  /**
   * True for calls that must return a JSON object (completeJSON). Sent as
   * `response_format: json_object` ONLY to a tier flagged `supportsJsonMode`
   * - every other provider's request body is unchanged.
   */
  jsonMode?: boolean;
  /**
   * Wall-clock budget for the WHOLE chain traversal, in ms. Each attempt's
   * timeout is capped to what is left, and no further tier is started once it
   * is spent (the call then rejects like an exhausted chain). Unset = the
   * per-tier timeouts alone apply, as before - on the free chain that adds up
   * to 10-40 s when the first tiers are rate-limited.
   */
  deadlineMs?: number | undefined;
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
  | "aicredits"
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
  /**
   * Skipped for question rewriting (normalizeMessyLanguage) only. Measured
   * 2026-09-18 on the real prompt: this tier returns VALID JSON with wrong
   * content - it drops or invents cities/states ("Houson Texas" -> "Texas",
   * "heart attack death rate" -> "... in Houston, Texas") and picks the
   * wrong metric. A rewrite is the one role whose output directly decides
   * which data is shown, with no downstream faithfulness check, so a
   * confident wrong answer is worse than moving on to the next tier. Still
   * used by every role that is validated downstream.
   */
  unsafeForRewrite?: boolean;
  /** Accepts `response_format: {"type": "json_object"}` - see SamplingOptions.jsonMode. */
  supportsJsonMode?: boolean;
  /**
   * Extra fields merged into this tier's OpenAI-compatible request body (core
   * fields - model, messages, temperature - always win). Used to switch off a
   * hybrid model's reasoning: `{ reasoning: { enabled: false } }`.
   */
  extraBody?: Record<string, unknown>;
  /**
   * Circuit-breaker key; defaults to `provider`, so tiers of one provider share
   * a circuit (a Groq 429 skips every Groq tier). Set it when two tiers of the
   * same gateway must fail independently.
   */
  circuitKey?: string;
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
  { provider: "groq", model: "allam-2-7b", apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1", timeoutMs: 4000, maxRetries: 1, keyId: "groq-allam-2-7b", isFree: true, unsafeForRewrite: true },

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

/**
 * R7 (2026-09-18): the two PAID tiers - first in line for the question-rewrite
 * role (normalizeMessyLanguage / intent) ONLY. They are deliberately not in
 * FALLBACK_CHAIN: suggestions, summaries and conversational replies use that
 * chain, so they can never spend them.
 *
 * AICredits (https://api.aicredits.in/v1) is an OpenAI-compatible gateway;
 * the key is the existing ZAI_API_KEY. Unset key = Graceful Unset Bypass, the
 * rewrite chain is then exactly the free chain it was before. A key with no
 * credit answers 4xx: each tier is skipped (no retry) and the free chain takes
 * over.
 *
 * Choice made on the same 42-case rewrite battery (3 runs each, same prompt):
 *  1. qwen/qwen3.7-flash, reasoning OFF - 39-40/42, no wrong-answer rewrites,
 *     hospital names returned unchanged 10/10, ~INR 2.5 per 1K queries, p50
 *     ~1 s. It reasons by default (10-12 s), so `reasoning: {enabled: false}`
 *     is mandatory. Its one flaw is an upstream 429 on ~2-8% of calls (a call
 *     that fails takes ~9 s to return), hence the 3 s cutoff and no retry.
 *  2. qwen/qwen3-30b-a3b-instruct-2507 - 38-39/42, no HTTP error in ~175
 *     calls (open-weight, several hosts), p50 ~1 s, p95 2.7-3.8 s (hence 4 s),
 *     ~INR 16 per 1K queries, non-thinking only.
 * Rejected on the same evidence: gemini-2.5-flash-lite (fastest and steadiest,
 * but silently drops "best"/"Texas"/hospital names), mistral-nemo (excluded by
 * the owner), phi-4 (IFEval 63), amazon/nova-micro and gemma-3-4b (wrong
 * rewrites), z-ai/glm-5.3-flash (reasoning cannot be disabled, 3-8 s).
 *
 * Each tier has its OWN circuit breaker: two tiers of one gateway share a
 * provider kind, and a shared circuit would let a failing second tier take the
 * first one down with it.
 */
export const AICREDITS_QWEN_FLASH_TIER: ProviderConfig = {
  provider: "aicredits",
  model: "qwen/qwen3.7-flash",
  apiKey: process.env.ZAI_API_KEY,
  baseURL: "https://api.aicredits.in/v1",
  timeoutMs: 3000,
  maxRetries: 0,
  keyId: "aicredits-qwen3.7-flash",
  circuitKey: "aicredits-qwen3.7-flash",
  isFree: false,
  supportsJsonMode: true,
  extraBody: { reasoning: { enabled: false } },
};

export const AICREDITS_QWEN_30B_TIER: ProviderConfig = {
  provider: "aicredits",
  model: "qwen/qwen3-30b-a3b-instruct-2507",
  apiKey: process.env.ZAI_API_KEY,
  baseURL: "https://api.aicredits.in/v1",
  timeoutMs: 4000,
  maxRetries: 0,
  keyId: "aicredits-qwen3-30b-a3b",
  circuitKey: "aicredits-qwen3-30b-a3b",
  isFree: false,
  supportsJsonMode: true,
};

export const AICREDITS_NORMALIZER_TIERS: ProviderConfig[] = [AICREDITS_QWEN_FLASH_TIER, AICREDITS_QWEN_30B_TIER];

export const NORMALIZER_CHAIN: ProviderConfig[] = [...AICREDITS_NORMALIZER_TIERS, ...FALLBACK_CHAIN];

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
      ...(config.extraBody ?? {}),
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: sampling.temperature,
      ...(sampling.topP !== undefined ? { top_p: sampling.topP } : {}),
      ...(sampling.jsonMode && config.supportsJsonMode ? { response_format: { type: "json_object" } } : {}),
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
    case "aicredits":
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

const circuits = new Map<string, CircuitState>();

/** `circuitKey` when a tier opted into its own circuit, else its provider (shared by every tier of that provider). */
const circuitKeyOf = (config: ProviderConfig): string => config.circuitKey ?? config.provider;

function circuitFor(provider: string): CircuitState {
  let circuit = circuits.get(provider);
  if (!circuit) {
    circuit = { state: "closed", failureCount: 0, openedAt: 0 };
    circuits.set(provider, circuit);
  }
  return circuit;
}

function isCircuitOpen(provider: string): boolean {
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

function recordSuccess(provider: string): void {
  circuits.set(provider, { state: "closed", failureCount: 0, openedAt: 0 });
}

function recordFailure(provider: string): void {
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

/** What one chain traversal did - filled in by runChain for a caller that wants to record it. */
interface ChainTrace {
  attempts: number;
  tiers: string[];
  answeredBy?: ProviderConfig;
}

/**
 * Which tier answered a rewrite and what it took to get there. Flat scalars
 * on purpose: the runtime engine stores this verbatim as opaque trace detail
 * and never interprets it. Without it a wrong rewrite (the Houston case)
 * could not be attributed to the tier that produced it.
 */
export type LlmProvenance = {
  provider: string;
  model: string;
  keyId: string;
  /** HTTP attempts across the whole traversal (retries and fallbacks included). */
  attempts: number;
  /** Wall time of the whole traversal. */
  latencyMs: number;
  /** keyIds actually attempted, in order, joined with ">". */
  tiers: string;
  /** True when a tier other than the first one attempted answered. */
  fallbackUsed: boolean;
};

function toProvenance(trace: ChainTrace, startedAt: number): LlmProvenance {
  const answered = trace.answeredBy;
  return {
    provider: answered?.provider ?? "none",
    model: answered?.model ?? "none",
    keyId: answered?.keyId ?? "none",
    attempts: trace.attempts,
    latencyMs: Date.now() - startedAt,
    tiers: trace.tiers.join(">"),
    fallbackUsed: answered ? trace.tiers[0] !== answered.keyId : trace.tiers.length > 1,
  };
}

/** One gateway call made while serving a request. `provider: "none"` = every tier failed or the deadline ran out. */
export type LlmCallRecord = LlmProvenance & {
  role: "normalizer" | "summary" | "suggestions" | "conversational";
};

// Per-request, not module-level: an edge isolate serves concurrent requests,
// and a shared array would mix their calls together.
const callLog = new AsyncLocalStorage<LlmCallRecord[]>();

/** Runs `fn` and returns its result plus every gateway call made inside it (including calls it awaited transitively). */
export async function withLlmCallLog<T>(fn: () => Promise<T>): Promise<{ result: T; calls: LlmCallRecord[] }> {
  const calls: LlmCallRecord[] = [];
  const result = await callLog.run(calls, fn);
  return { result, calls };
}

function recordCall(role: LlmCallRecord["role"], trace: ChainTrace, startedAt: number): void {
  callLog.getStore()?.push({ role, ...toProvenance(trace, startedAt) });
}

async function runChain(
  chain: ProviderConfig[],
  systemPrompt: string,
  userMessage: string,
  sampling: SamplingOptions,
  /**
   * Phase 3.6 (LLM-First Front Door): optional content-shape check, used
   * by completeJSON() below. A provider that responds with HTTP 200 but
   * ignores the "return ONLY this JSON shape" instruction (a real,
   * observed failure mode on weaker fallback-chain tiers, not
   * hypothetical) used to be indistinguishable from "every provider is
   * down" - the whole chain failed outright on the first successful-but-
   * malformed response, never trying the tiers after it. This is a
   * content-shape failure, not a network/availability one: it never
   * calls recordFailure() (that provider answered fine, just not in the
   * shape THIS caller needed) and never opens that provider's circuit
   * breaker for other callers (e.g. complete(), which has no such shape
   * requirement).
   */
  isValid?: (content: string) => boolean,
  trace?: ChainTrace,
): Promise<string> {
  const deadline = sampling.deadlineMs === undefined ? undefined : Date.now() + sampling.deadlineMs;
  for (const config of chain) {
    // Graceful Unset Bypass: a tier with no configured key (ollama and
    // mock excepted - neither needs one) is skipped BEFORE any network
    // call is constructed - zero HTTP overhead, not a caught error.
    if (!config.apiKey && config.provider !== "ollama" && config.provider !== "mock") {
      continue;
    }
    if (isCircuitOpen(circuitKeyOf(config))) {
      continue;
    }
    if (sampling.forRewrite && config.unsafeForRewrite) {
      continue;
    }

    let attempt = 0;
    // maxRetries applies only to non-rate-limit errors (see below) -
    // Zero-Stall 429 Failover means a 429/503 never retries in place.
    while (attempt <= config.maxRetries) {
      const timeoutMs = deadline === undefined ? config.timeoutMs : Math.min(config.timeoutMs, deadline - Date.now());
      if (timeoutMs <= 0) {
        throw new Error(`LLM call deadline of ${sampling.deadlineMs}ms exhausted`);
      }
      try {
        if (trace) {
          trace.attempts += 1;
          if (trace.tiers[trace.tiers.length - 1] !== config.keyId) {
            trace.tiers.push(config.keyId);
          }
        }
        const result = await withTimeout(
          callAdapter(config, systemPrompt, userMessage, sampling),
          timeoutMs,
        );
        const raw = config.stripReasoningTokens ? stripReasoning(result.content) : result.content;
        if (isValid && !isValid(raw)) {
          logFallbackEvent(config.keyId, "response did not match expected shape - advancing to next tier", new Error("shape validation failed"));
          break; // advance to next tier - this provider itself is fine
        }
        recordSuccess(circuitKeyOf(config));
        if (trace) {
          trace.answeredBy = config;
        }
        return raw;
      } catch (error) {
        if (error instanceof RateLimitedError) {
          recordFailure(circuitKeyOf(config));
          logFallbackEvent(config.keyId, "429/503 - zero-stall failover, no retry", error);
          break; // advance to next tier immediately, no retry
        }
        attempt += 1;
        if (attempt > config.maxRetries) {
          recordFailure(circuitKeyOf(config));
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
  /**
   * Batch 1 (D2): the user's own words for everything the question asks that the capability catalog cannot
   * answer, reported alongside whatever status the normalizer chose (the report never changes the status). The
   * caller refuses when a reported term names a topic the domain lists as unsupported, instead of answering the
   * rest of the question and dropping those words; absent or empty leaves behavior unchanged.
   */
  unsupported_terms?: string[];
  /** Added by the gateway (never by the model): which tier answered, attempts, latency. Present on every result, including "LLM gateway unavailable". */
  provenance?: LlmProvenance;
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
  /**
   * Batch 1 (D2): topics the domain knows it cannot answer, derived by the domain from its own registry so that
   * registering the capability removes the entry. The caller treats a decline as binding only when a reported term
   * names one of them. Batch 2 (Option A): this list is deliberately NOT rendered into the normalizer prompt - it
   * inverted an unrelated ranking direction (see 1_BatchWordDropAndRefusalFIX.md, A026) - so it only corroborates
   * what the model reports on its own under RULE 6.
   */
  unsupportedTopics?: string[];
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
 * Names-only rendering of a capability catalog for the normalizer prompt
 * (LLM call-count audit R2). describeCapabilities() also ships metric
 * descriptions, the full state list, example questions and non-answerable
 * examples - the normalizer's rules and few-shot already cover those, and
 * only conversational Layer 0 (handleConversational) needs them. Concept
 * aliases stay: they are the phrases a rewrite must land on for the
 * deterministic pipeline to resolve the condition. Without a catalog it
 * degrades exactly as describeCapabilities() does.
 */
function describeCapabilitiesCompact(capabilities?: CapabilityCatalog): string {
  if (!capabilities) {
    return describeCapabilities();
  }
  const conditions = (capabilities.concepts ?? []).map((c) => `${c.displayName} (${c.aliases.join(", ")})`).join("; ");
  return [
    `METRICS (exact names only): ${capabilities.metrics.map((m) => m.displayName).join(", ")}.`,
    `OWNERSHIPS: ${capabilities.ownerships.join(", ")}.`,
    conditions
      ? `CONDITIONS - use only the exact display name before the brackets; the bracketed phrases are what users say for it: ${conditions}.`
      : "",
    "STATES: any US state, written as its full name.",
  ]
    .filter(Boolean)
    .join("\n");
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
  /**
   * `chain` serves every role; `rewriteChain` serves the question-rewrite role
   * (normalizeMessyLanguage) only and defaults to `chain`, so a gateway built
   * with one chain - every existing caller and test - behaves exactly as before.
   */
  constructor(
    private readonly chain: ProviderConfig[] = FALLBACK_CHAIN,
    private readonly rewriteChain: ProviderConfig[] = chain,
  ) {}

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
    return this.runJSON<T>(this.chain, systemPrompt, userMessage, options);
  }

  private async runJSON<T>(
    chain: ProviderConfig[],
    systemPrompt: string,
    userMessage: string,
    options: SamplingOptions,
    trace?: ChainTrace,
  ): Promise<T> {
    const isValidJson = (content: string): boolean => {
      try {
        JSON.parse(extractJsonBoundary(content));
        return true;
      } catch {
        return false;
      }
    };
    const raw = await runChain(chain, systemPrompt, userMessage, { ...options, jsonMode: true }, isValidJson, trace);
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
    // LLM call-count audit R2 (2026-09-18): rewritten from a 15,906-char /
    // 3,730-token prompt (measured) to a compact, rule-ordered one. Goals:
    // (1) fewer tokens per call - Groq's free tier caps at 8,000 TOKENS per
    // minute, so prompt size, not call count, is what exhausts it;
    // (2) fix the two frontend failures - a named city was dropped or
    // widened (the old shape rule had no city slot) and "show me hospital
    // Houson Texas", written without "in", was rejected by tiers that
    // pattern-match on examples that all contained "in"; (3) stop restating
    // what deterministic code already does - the 50-state abbreviation map
    // (expandUppercaseStateAbbreviations already expands 36 codes in any
    // case; the 13 that collide with English words are covered by the one
    // state-code rule below). Behaviors the old prompt encoded for earlier
    // fixes (ownership preservation, good -> best, typo handling, condition
    // default, "needs a state" clarification, off-topic fallback) are kept
    // as a rule or an example.
    const systemPrompt = [
      "You rewrite ONE user question about US hospital analytics into ONE canonical question that a deterministic pipeline can resolve. You never answer questions, never write SQL, never invent facts.",
      'Return ONLY this JSON, nothing else: {"status": "ok" | "need_clarification" | "fallback", "canonical_question": string | null, "reason": string | null, "unsupported_terms": string[]}',
      "",
      "RULE 1 - SLOT PRESERVATION (highest priority, beats every other rule):",
      "Never ADD a state, city, county, ownership type, metric or condition that is not in the original question in some form (correct, misspelled or abbreviated). Never DROP or BROADEN one that is: a named city stays a city (\"in Houston\" is never widened to the state or the nation), an ownership word stays (government, non-profit, for-profit...), a state stays. If the question names no location, the canonical question names none - never guess one, and never attach a state to a bare city. A hospital, clinic or health-system NAME (Mayo Clinic, Johns Hopkins, Cleveland Clinic, NYU Langone, Memorial Hospital) is a name, never a place: a question about a named hospital is returned exactly as written (status ok, identical text).",
      "",
      "RULE 2 - FIX THE WRITING, KEEP THE MEANING:",
      "Correct typos in any word: metrics (\"saftey\" -> safety), ownership (\"goverment\"/\"govt\"/\"gov\" -> government, \"nonprofit\" -> non-profit, \"for profit\" -> for-profit), cities (\"Houson\"/\"Huston\" -> Houston), states (\"Calfornia\" -> California). A two-letter US state code in ANY letter case placed right after \"in\" or next to \"hospital(s)\" is a state (\"hospitals in oh\" -> Ohio, \"in tx\" -> Texas, \"hospital in IN\" -> Indiana); \"CA\" is California, never Canada; the ordinary word \"in\" is never a state; \"VA hospitals\" is the Veterans ownership alias - leave it as written (only \"in VA\" means Virginia). Always write full, proper-case state names. Expand an informal name only when it names exactly one place: cali -> California, tex -> Texas, philly -> Philadelphia, NYC -> New York City; leave ambiguous or multi-city forms (LA, DFW) exactly as written. A question that is already clean and complete is returned unchanged.",
      "",
      "RULE 3 - THE REQUEST SHAPES (the \"in\" may be missing in the original):",
      "(a) LISTING - a location (state, city, or city + state) and no metric or ranking word is a COMPLETE request: \"Show me hospitals in <location>\", with an ownership word before \"hospitals\" when present (\"Show me government hospitals in <location>\"). Status ok. Never ask for clarification when a location is present.",
      "(b) RANKING - \"Show me hospitals with <best|top|highest|lowest|worst> <metric>\", then \"in <City>\", \"in <City>, <State>\" or \"in <State>\" - only the location parts the original had (an ownership word goes before \"hospitals\": \"Show me non-profit hospitals with lowest Mortality Rate in Ohio\"). good/great/excellent = best; bad/poor = worst; \"safest\" = best Safety Performance; every superlative (safest, strongest, top-rated) is a ranking word. For Mortality Rate and Readmission Rate lower is better: best/good -> lowest, worst/bad -> highest (\"hospital with good mortality\" -> \"Show me hospitals with lowest Mortality Rate\"). Use the metric's exact display name from METRICS; a metric name alone is never a canonical question. A ranking needs NO location.",
      "(c) CONDITION - a listed clinical condition (see CONDITIONS) with no ranking word defaults to \"lowest\" of its mortality or readmission measure (\"bypass surgery readmission\" -> \"Show me hospitals with lowest CABG Readmission\"); with a ranking word keep its direction. A condition never needs a location.",
      "(d) STAR RATING - \"3 star\", \"3 start\", \"5-star\" is a Hospital Overall Rating filter, always written \"N-star\" (never \"Hospital Overall Rating of N\"), e.g. \"Show me 3-star hospitals in Georgia\". It needs a state - with none in the question, status need_clarification.",
      "",
      "RULE 4 - HEART LANGUAGE:",
      "(a) Symptom words - \"heart pain\", \"chest pain\", \"chest discomfort\", \"my chest hurts\", \"my heart hurts\", \"heart ache\" - mean a heart attack: \"Show me hospitals with lowest Mortality Rate for Acute Myocardial Infarction\" (plus the location if one was given).",
      "(b) General heart-care quality - \"heart care\", \"heart attack dead\" - means Mortality Rate: \"best heart care hospital\" -> \"Show me hospitals with lowest Mortality Rate\".",
      "(c) Only a BARE \"heart issue\" / \"heart problem\", \"lung disease\", \"shortness of breath\" or \"checkup\", with no word from (a) or (b), is ambiguous - status fallback, never guessed.",
      "",
      "RULE 5 - WHEN NOT TO REWRITE:",
      "status \"fallback\" (canonical_question null) when the question is not about US hospital performance (weather, trivia, people, jobs...) or maps to nothing in the lists below. status \"need_clarification\" (reason = one short question, e.g. \"Which state should I look in?\") ONLY when the request names a metric or star rating, has NO location, and has NO ranking word (best, top, highest, lowest, worst, good, great, excellent, bad, poor, safest, or any other superlative), or is genuinely ambiguous between two metrics. A question with a ranking word or a location is never need_clarification for lack of a location.",
      "",
      "RULE 6 - REPORT WHAT IS NOT SUPPORTED (a report only: it never changes status, canonical_question or any other rule):",
      "Fill unsupported_terms with the user's EXACT words (copied from the question) for anything they ask FOR that is outside METRICS, CONDITIONS, OWNERSHIPS, STATES, US places and hospital names: a condition or measure that is not listed, a symptom (except the heart language in RULE 4), a hospital attribute or service (hospital type, emergency services, cleanliness, staff communication), a time window (a year, \"since 2020\"). Never list comparison words, hospital names, typos or informal wording of a LISTED thing, or code fragments. Choose status and canonical_question exactly as the other rules say; when nothing is unsupported, unsupported_terms is [].",
      "",
      "EXAMPLES - they show FORMAT only. Never copy a place, ownership type or metric from an example into a question that does not contain it.",
      "\"goverment hospital in California\" -> \"Show me government hospitals in California\"",
      "\"show me hospital Houson Texas\" -> \"Show me hospitals in Houston, Texas\"",
      "\"best hospital for heart pain Houston\" -> \"Show me hospitals with lowest Mortality Rate for Acute Myocardial Infarction in Houston\"",
      "\"best hospital for heart pain Phoenix\" -> \"Show me hospitals with lowest Mortality Rate for Acute Myocardial Infarction in Phoenix\"",
      "\"best hospital for chest pain in Columbus, Ohio\" -> \"Show me hospitals with lowest Mortality Rate for Acute Myocardial Infarction in Columbus, Ohio\"",
      "\"show me hospital for heart pain\" -> \"Show me hospitals with lowest Mortality Rate for Acute Myocardial Infarction\"",
      "\"Which hospitals have the lowest mortality rates?\" -> \"Show me hospitals with lowest Mortality Rate\"",
      "\"good saftey\" -> \"Show me hospitals with best Safety Performance\"",
      "\"safest hosptials\" -> \"Show me hospitals with best Safety Performance\"",
      "\"best heart care hospital\" -> \"Show me hospitals with lowest Mortality Rate\"",
      "\"3 start hospitals in Georgia\" -> \"Show me 3-star hospitals in Georgia\"",
      "\"hospitals with a 4 star rating\" -> status need_clarification, reason \"Which state should I look in?\"",
      "\"hospitals in ok\" -> \"Show me hospitals in Oklahoma\"",
      "\"what's the weather in Dallas?\" -> status fallback",
      "",
      describeCapabilitiesCompact(capabilities),
    ].join("\n");

    const startedAt = Date.now();
    const trace: ChainTrace = { attempts: 0, tiers: [] };
    try {
      // Master LLM Audit: canonicalization is a factual/deterministic-shaped
      // task (typo correction, alias expansion), not a creative one - a
      // low temperature makes the same input produce the same rewrite
      // far more reliably. Confirmed live (Bug L) that the previous
      // shared temperature 0.9 caused the identical "goverment hospital
      // in CA" input to sometimes drop the ownership filter and
      // sometimes not, across separate calls with no code change.
      //
      // Phase 3.6 (LLM-First Front Door): lowered further, from 0.1 to
      // 0.0. This method used to run only as an on-failure fallback (a
      // small fraction of traffic); as Layer 0.5 it now runs on nearly
      // every analytical query, so its output variance has a much
      // larger blast radius - the lowest safe temperature for a
      // factual-rewrite task is the right default now, not just a
      // marginal improvement. Same multi-vendor-fallback caveat as
      // before still applies: a low temperature makes one provider
      // consistent, it does not make a weaker fallback-chain provider
      // follow instructions as reliably once the primary is
      // quota-exhausted.
      const result = await this.runJSON<MessyLanguageResult>(
        this.rewriteChain,
        systemPrompt,
        question,
        { temperature: 0.0, forRewrite: true },
        trace,
      );
      if (result && (result.status === "ok" || result.status === "need_clarification" || result.status === "fallback")) {
        return { ...result, provenance: toProvenance(trace, startedAt) };
      }
      return { status: "fallback", reason: "malformed gateway response", provenance: toProvenance(trace, startedAt) };
    } catch (error) {
      logFallbackEvent("normalizeMessyLanguage", "all providers exhausted", error);
      return { status: "fallback", reason: "LLM gateway unavailable", provenance: toProvenance(trace, startedAt) };
    } finally {
      recordCall("normalizer", trace, startedAt);
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
  async synthesizeSuggestions(context: SuggestionPromptContext, deadlineMs?: number): Promise<string[]> {
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

    const startedAt = Date.now();
    const trace: ChainTrace = { attempts: 0, tiers: [] };
    try {
      // Master LLM Audit: medium temperature - enough lexical variety to
      // avoid robotic repeats, but this method must never invent a new
      // fact (only rephrase already-decided candidates), so it stays
      // well below the high end used for genuinely creative/diverse
      // suggestion generation (selectAndRephraseSuggestions).
      const result = await this.runJSON<string[]>(this.chain, systemPrompt, userMessage, { temperature: 0.6, deadlineMs }, trace);
      if (Array.isArray(result) && result.length === context.candidates.length && result.every((s) => typeof s === "string" && s.length > 0)) {
        return result;
      }
      return context.candidates;
    } catch (error) {
      logFallbackEvent("synthesizeSuggestions", "all providers exhausted", error);
      return context.candidates;
    } finally {
      recordCall("suggestions", trace, startedAt);
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
  async summarizeResult(question: string, rows: Record<string, unknown>[], deadlineMs?: number): Promise<string> {
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

    const startedAt = Date.now();
    const trace: ChainTrace = { attempts: 0, tiers: [] };
    try {
      // Master LLM Audit: low temperature - this is a factual restatement
      // task (only numbers/names/values already present in `rows`), the
      // same class as summarization/factual-QA in the research this audit
      // is based on - a lower temperature reduces the chance of the kind
      // of narrative drift already observed elsewhere in this campaign
      // (e.g. a name-swap hallucination between two compared hospitals'
      // stats in an earlier dogfooding round).
      const summary = await runChain(this.chain, systemPrompt, userMessage, { temperature: 0.2, deadlineMs }, undefined, trace);
      return summary.trim();
    } catch (error) {
      logFallbackEvent("summarizeResult", "all providers exhausted", error);
      return "";
    } finally {
      recordCall("summary", trace, startedAt);
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

    const startedAt = Date.now();
    const trace: ChainTrace = { attempts: 0, tiers: [] };
    try {
      // Master LLM Audit: kept high (this method's shape needs a warm,
      // varied, non-repetitive onboarding tone across turns - a "normal
      // chatbot" task per the research this audit is based on, not a
      // factual/canonicalization one).
      const result = await this.runJSON<{ answer?: string; suggestions?: string[] }>(this.chain, systemPrompt, question, { temperature: 0.8 }, trace);
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
    } finally {
      recordCall("conversational", trace, startedAt);
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
    deadlineMs?: number,
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

    const startedAt = Date.now();
    const trace: ChainTrace = { attempts: 0, tiers: [] };
    try {
      // Master LLM Audit: kept high - this is the brainstorming/diversity
      // task (research: 0.7-1.1 best creativity-to-cost ratio for idea
      // generation) - a low temperature here would defeat the entire
      // point of this method (avoiding repetitive, formulaic suggestions).
      const result = await this.runJSON<string[]>(this.chain, systemPrompt, userMessage, { temperature: 0.8, deadlineMs }, trace);
      if (Array.isArray(result) && result.length === count && result.every((s) => typeof s === "string" && s.length > 0)) {
        return result;
      }
      return fallback;
    } catch (error) {
      logFallbackEvent("selectAndRephraseSuggestions", "all providers exhausted", error);
      return fallback;
    } finally {
      recordCall("suggestions", trace, startedAt);
    }
  }
}

export const llmGateway = new LLMModelGateway(FALLBACK_CHAIN, NORMALIZER_CHAIN);
