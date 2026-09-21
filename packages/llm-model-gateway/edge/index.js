// src/llm-model-gateway.ts
import { AsyncLocalStorage } from "node:async_hooks";
var FALLBACK_CHAIN = [
  // --- Groq (primary). LIVE-VERIFIED 2026-09-13 via GET
  // https://api.groq.com/openai/v1/models: "llama-3.3-70b-versatile" and
  // "llama-3.1-8b-instant" (this design's original assumption) both now
  // 404 "does not exist" - Groq's free catalog today is the open-weight
  // GPT-OSS family it hosts directly, not Llama. Using the two
  // confirmed-present, json_mode-capable models instead. ---
  { provider: "groq", model: "openai/gpt-oss-20b", apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1", timeoutMs: 3e3, maxRetries: 2, keyId: "groq-gpt-oss-20b", isFree: true },
  { provider: "groq", model: "openai/gpt-oss-120b", apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1", timeoutMs: 4e3, maxRetries: 1, keyId: "groq-gpt-oss-120b", isFree: true },
  // --- Extra Groq quota tier, added after live dogfooding exhausted the
  // 2 gpt-oss tiers' 1K-requests/day cap each (confirmed via this org's
  // own Groq console limits). "allam-2-7b" is a real general-purpose
  // chat-completion model (not a classifier) with a 7K-requests/day cap
  // - nearly 7x the headroom of either gpt-oss tier. Placed after both
  // gpt-oss tiers (they're still faster/more capable when available);
  // Zero-Stall 429 Failover means this only ever gets tried once both
  // are already exhausted or erroring, at no added latency cost when
  // they're healthy. ---
  { provider: "groq", model: "allam-2-7b", apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1", timeoutMs: 4e3, maxRetries: 1, keyId: "groq-allam-2-7b", isFree: true, unsafeForRewrite: true },
  // --- Google Gemini. LIVE-VERIFIED 2026-09-13: "gemini-2.0-flash" and
  // "gemini-1.5-flash" (this design's original assumption) both now 404
  // - Google's own error response explicitly names the current
  // replacement model, used here directly rather than guessed. ---
  { provider: "google", model: "gemini-3.6-flash", apiKey: process.env.GOOGLE_API_KEY, timeoutMs: 4e3, maxRetries: 2, keyId: "google-3.6-flash", isFree: true },
  // --- OpenRouter — ONE real key confirmed in .env today (not two -
  // the design's original "meta-llama/...instruct:free" entries are
  // confirmed gone from OpenRouter's free catalog as of 2026-09-13 (404
  // "unavailable for free"); replaced with models LIVE-CONFIRMED present
  // via GET https://openrouter.ai/api/v1/models - "laguna-s-2.1:free" is
  // also confirmed WORKING end-to-end by this package's own live smoke
  // test (scripts/verify-llm-gateway.ts). ---
  { provider: "openrouter", model: "poolside/laguna-s-2.1:free", apiKey: process.env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1", timeoutMs: 6e3, maxRetries: 2, keyId: "openrouter-key1-laguna-s", isFree: true, stripReasoningTokens: true },
  { provider: "openrouter", model: "poolside/laguna-xs-2.1:free", apiKey: process.env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1", timeoutMs: 5e3, maxRetries: 1, keyId: "openrouter-key1-laguna-xs", isFree: true, stripReasoningTokens: true },
  { provider: "openrouter", model: "nvidia/nemotron-3-super-120b-a12b:free", apiKey: process.env.OPENROUTER_API_KEY_2 || process.env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1", timeoutMs: 8e3, maxRetries: 1, keyId: "openrouter-key2-nemotron-super", isFree: true, stripReasoningTokens: true },
  // --- NVIDIA NIM (direct) — OpenAI-compatible, free tier ~40 RPM
  // global cap. Reasoning model - stripReasoningTokens mandatory. ---
  { provider: "nvidia", model: "nvidia/nemotron-3-ultra-550b-a55b", apiKey: process.env.NVIDIA_API_KEY, baseURL: "https://integrate.api.nvidia.com/v1", timeoutMs: 15e3, maxRetries: 1, keyId: "nvidia-direct-nemotron", isFree: true, stripReasoningTokens: true },
  // --- Future placeholders — confirmed ABSENT from .env today.
  // Graceful Unset Bypass (§6) skips these with zero network calls;
  // adding a key later activates them with zero code change. ---
  { provider: "openai", model: "gpt-4o-mini", apiKey: process.env.OPENAI_API_KEY, baseURL: "https://api.openai.com/v1", timeoutMs: 4e3, maxRetries: 2, keyId: "openai-mini", isFree: false },
  { provider: "openai", model: "gpt-4o", apiKey: process.env.OPENAI_API_KEY, baseURL: "https://api.openai.com/v1", timeoutMs: 6e3, maxRetries: 1, keyId: "openai-gpt4o", isFree: false },
  { provider: "anthropic", model: "claude-3-5-haiku-latest", apiKey: process.env.ANTHROPIC_API_KEY, timeoutMs: 4e3, maxRetries: 2, keyId: "anthropic-haiku", isFree: false },
  { provider: "anthropic", model: "claude-3-5-sonnet-latest", apiKey: process.env.ANTHROPIC_API_KEY, timeoutMs: 6e3, maxRetries: 1, keyId: "anthropic-sonnet", isFree: false },
  { provider: "cerebras", model: "llama-3.3-70b", apiKey: process.env.CEREBRAS_API_KEY, baseURL: "https://api.cerebras.ai/v1", timeoutMs: 3e3, maxRetries: 2, keyId: "cerebras-70b", isFree: true },
  { provider: "mistral", model: "mistral-large-latest", apiKey: process.env.MISTRAL_API_KEY, baseURL: "https://api.mistral.ai/v1", timeoutMs: 5e3, maxRetries: 1, keyId: "mistral-large", isFree: false },
  // --- Local, always available when running. ---
  { provider: "ollama", model: "llama3", endpoint: process.env.OLLAMA_ENDPOINT ?? "http://localhost:11434", timeoutMs: 8e3, maxRetries: 1, keyId: "ollama-local", isFree: true },
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
  { provider: "mock", model: "deterministic-fallback", timeoutMs: 0, maxRetries: 0, keyId: "mock-deterministic", isFree: true }
];
var AICREDITS_QWEN_FLASH_TIER = {
  provider: "aicredits",
  model: "qwen/qwen3.7-flash",
  apiKey: process.env.ZAI_API_KEY,
  baseURL: "https://api.aicredits.in/v1",
  timeoutMs: 3e3,
  maxRetries: 0,
  keyId: "aicredits-qwen3.7-flash",
  circuitKey: "aicredits-qwen3.7-flash",
  isFree: false,
  supportsJsonMode: true,
  extraBody: { reasoning: { enabled: false } }
};
var AICREDITS_QWEN_30B_TIER = {
  provider: "aicredits",
  model: "qwen/qwen3-30b-a3b-instruct-2507",
  apiKey: process.env.ZAI_API_KEY,
  baseURL: "https://api.aicredits.in/v1",
  timeoutMs: 4e3,
  maxRetries: 0,
  keyId: "aicredits-qwen3-30b-a3b",
  circuitKey: "aicredits-qwen3-30b-a3b",
  isFree: false,
  supportsJsonMode: true
};
var AICREDITS_NORMALIZER_TIERS = [AICREDITS_QWEN_FLASH_TIER, AICREDITS_QWEN_30B_TIER];
var NORMALIZER_CHAIN = [...AICREDITS_NORMALIZER_TIERS, ...FALLBACK_CHAIN];
var AICREDITS_QWEN_FLASH_DECORATION_TIER = {
  ...AICREDITS_QWEN_FLASH_TIER,
  timeoutMs: 2500,
  keyId: "aicredits-qwen3.7-flash-decoration",
  circuitKey: "aicredits-qwen3.7-flash-decoration"
};
var AICREDITS_QWEN_FLASH_SUMMARY_TIER = { ...AICREDITS_QWEN_FLASH_DECORATION_TIER, timeoutMs: 3300 };
var DECORATION_CHAIN = [AICREDITS_QWEN_FLASH_DECORATION_TIER, ...FALLBACK_CHAIN];
var SUMMARY_CHAIN = [
  AICREDITS_QWEN_FLASH_SUMMARY_TIER,
  ...FALLBACK_CHAIN.filter((tier) => tier.keyId !== "groq-allam-2-7b")
];
function stripReasoning(text) {
  return text.replace(/<thought>[\s\S]*?<\/thought>/gi, "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}
function extractJsonBoundary(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const trimmed = candidate.trim();
  const firstBrace = Math.min(
    ...[trimmed.indexOf("{"), trimmed.indexOf("[")].filter((i) => i >= 0)
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
async function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
var RateLimitedError = class extends Error {
  constructor(status) {
    super(`rate limited or overloaded (HTTP ${status})`);
    this.status = status;
  }
  status;
};
async function callOpenAICompatible(config, systemPrompt, userMessage, sampling) {
  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      ...config.extraBody ?? {},
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: sampling.temperature,
      ...sampling.topP !== void 0 ? { top_p: sampling.topP } : {},
      ...sampling.jsonMode && config.supportsJsonMode ? { response_format: { type: "json_object" } } : {}
    })
  });
  if (response.status === 429 || response.status === 503) {
    throw new RateLimitedError(response.status);
  }
  if (!response.ok) {
    throw new Error(`${config.provider} HTTP ${response.status}: ${await response.text()}`);
  }
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error(`${config.provider} returned no completion content`);
  }
  return { content };
}
async function callGoogle(config, systemPrompt, userMessage, sampling) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
      generationConfig: {
        temperature: sampling.temperature,
        ...sampling.topP !== void 0 ? { topP: sampling.topP } : {}
      }
    })
  });
  if (response.status === 429 || response.status === 503) {
    throw new RateLimitedError(response.status);
  }
  if (!response.ok) {
    throw new Error(`google HTTP ${response.status}: ${await response.text()}`);
  }
  const body = await response.json();
  const content = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof content !== "string") {
    throw new Error("google returned no completion content");
  }
  return { content };
}
async function callAnthropic(config, systemPrompt, userMessage, sampling) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey ?? "",
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      temperature: sampling.temperature,
      ...sampling.topP !== void 0 ? { top_p: sampling.topP } : {}
    })
  });
  if (response.status === 429 || response.status === 503) {
    throw new RateLimitedError(response.status);
  }
  if (!response.ok) {
    throw new Error(`anthropic HTTP ${response.status}: ${await response.text()}`);
  }
  const body = await response.json();
  const content = body.content?.[0]?.text;
  if (typeof content !== "string") {
    throw new Error("anthropic returned no completion content");
  }
  return { content };
}
async function callOllama(config, systemPrompt, userMessage, sampling) {
  const response = await fetch(`${config.endpoint}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      stream: false,
      options: {
        temperature: sampling.temperature,
        ...sampling.topP !== void 0 ? { top_p: sampling.topP } : {}
      }
    })
  });
  if (!response.ok) {
    throw new Error(`ollama HTTP ${response.status}: ${await response.text()}`);
  }
  const body = await response.json();
  const content = body.message?.content;
  if (typeof content !== "string") {
    throw new Error("ollama returned no completion content");
  }
  return { content };
}
async function callMock() {
  throw new Error("mock tier reached - every real provider is unavailable");
}
async function callAdapter(config, systemPrompt, userMessage, sampling) {
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
var CIRCUIT_FAILURE_THRESHOLD = 3;
var CIRCUIT_COOLDOWN_MS = 3e4;
var circuits = /* @__PURE__ */ new Map();
var circuitKeyOf = (config) => config.circuitKey ?? config.provider;
function circuitFor(provider) {
  let circuit = circuits.get(provider);
  if (!circuit) {
    circuit = { state: "closed", failureCount: 0, openedAt: 0 };
    circuits.set(provider, circuit);
  }
  return circuit;
}
function isCircuitOpen(provider) {
  const circuit = circuitFor(provider);
  if (circuit.state !== "open") {
    return false;
  }
  if (Date.now() - circuit.openedAt >= CIRCUIT_COOLDOWN_MS) {
    circuit.state = "half-open";
    return false;
  }
  return true;
}
function recordSuccess(provider) {
  circuits.set(provider, { state: "closed", failureCount: 0, openedAt: 0 });
}
function recordFailure(provider) {
  const circuit = circuitFor(provider);
  circuit.failureCount += 1;
  if (circuit.state === "half-open" || circuit.failureCount >= CIRCUIT_FAILURE_THRESHOLD) {
    circuit.state = "open";
    circuit.openedAt = Date.now();
  }
}
function logFallbackEvent(keyId, reason, error) {
  console.error(
    JSON.stringify({
      component: "llm-model-gateway",
      keyId,
      reason,
      error: error instanceof Error ? error.message : String(error),
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    })
  );
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function toProvenance(trace, startedAt) {
  const answered = trace.answeredBy;
  return {
    provider: answered?.provider ?? "none",
    model: answered?.model ?? "none",
    keyId: answered?.keyId ?? "none",
    attempts: trace.attempts,
    latencyMs: Date.now() - startedAt,
    tiers: trace.tiers.join(">"),
    fallbackUsed: answered ? trace.tiers[0] !== answered.keyId : trace.tiers.length > 1
  };
}
var callLog = new AsyncLocalStorage();
async function withLlmCallLog(fn) {
  const calls = [];
  const result = await callLog.run(calls, fn);
  return { result, calls };
}
function recordCall(role, trace, startedAt) {
  callLog.getStore()?.push({ role, ...toProvenance(trace, startedAt) });
}
async function runChain(chain, systemPrompt, userMessage, sampling, isValid, trace) {
  const deadline = sampling.deadlineMs === void 0 ? void 0 : Date.now() + sampling.deadlineMs;
  for (const config of chain) {
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
    while (attempt <= config.maxRetries) {
      const timeoutMs = deadline === void 0 ? config.timeoutMs : Math.min(config.timeoutMs, deadline - Date.now());
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
          timeoutMs
        );
        const raw = config.stripReasoningTokens ? stripReasoning(result.content) : result.content;
        if (isValid && !isValid(raw)) {
          logFallbackEvent(config.keyId, "response did not match expected shape - advancing to next tier", new Error("shape validation failed"));
          break;
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
          break;
        }
        attempt += 1;
        if (attempt > config.maxRetries) {
          recordFailure(circuitKeyOf(config));
          logFallbackEvent(config.keyId, "exhausted retries", error);
          break;
        }
        await sleep(2 ** attempt * 100 + Math.random() * 100);
      }
    }
  }
  throw new Error("all configured LLM providers failed or were unavailable");
}
var NEUTRAL_WORDING = {
  normalizer: {
    subject: "the platform's data",
    rules: [
      "RULE 1 - SLOT PRESERVATION: never add, drop or broaden a place, category, metric or name that is in the original question in some form (correct, misspelled or abbreviated); a question that is already clean and complete is returned unchanged.",
      "",
      `RULE 2 - WHEN NOT TO REWRITE: status "unsupported" (canonical_question null) when the question is not about the platform's data or maps to nothing in the lists below.`
    ],
    examples: []
  },
  suggestionPhrasing: [
    "You are a suggestion-phrasing assistant.",
    "You will be given a list of already-decided, already-verified follow-up questions.",
    "Rephrase each one to sound more natural and varied - do NOT change what each one refers to.",
    "Do NOT add a new fact. Do NOT combine two suggestions into one. Do NOT invent anything not already",
    "present in the input list. Return a JSON array of strings, same length and same order as",
    "the input, one rephrased line per input line."
  ],
  suggestionSelector: [
    "You are a suggestion selector.",
    "You will be given a POOL of already-decided, already-verified follow-up questions - ALL are",
    "answerable. Your job: SELECT the most diverse and relevant ones, then rephrase each to sound",
    "natural. Diversity means covering different dimensions - do not select several that all differ only in",
    "wording, not in fact. Do NOT invent a new fact, do NOT combine two pool items into one, do NOT",
    "select or invent anything outside the given pool.",
    "Return a JSON array of exactly {count} rephrased strings, each corresponding to one selected pool item."
  ],
  summary: [
    "Summarize this table of real data in 1-2 sentences.",
    "You may ONLY state numbers, names, and values that literally appear in the JSON rows below.",
    "Never compute an average, a total, or any derived number yourself - only restate what a row",
    "already shows. Never state a fact about an entity not present in the rows.",
    "Return plain text, not JSON."
  ],
  conversational: {
    intro: [
      "You are a data analytics assistant. A user just sent a casual message",
      "(greeting, a question about what you can do, or something off-topic) - NOT an analytical",
      "question. Respond warmly in 2-3 sentences, explaining what you can help with."
    ],
    outro: [
      "Suggest 3-4 concrete, varied example questions built only from what is declared above. Never invent anything not declared above.",
      'Return ONLY this JSON shape: {"answer": string, "suggestions": string[]}'
    ],
    fallbackAnswer: "Hi! I'm a data analytics assistant. Try one of these:"
  },
  catalog: {
    full: {
      metrics: "You may ONLY use these exact metric display names: {list}.",
      states: "You may reference any of these places if the user's question names one: {list}.",
      ownerships: "You may reference any of these categories: {list}.",
      concepts: "You may also reference these concepts (use ONLY the exact display name shown, never invent your own name): {list}.",
      examples: "Example questions this platform CAN answer: {list}.",
      nonAnswerable: "This platform CANNOT answer questions outside its data, e.g.: {list}."
    },
    compact: {
      metrics: "METRICS (exact names only): {list}.",
      ownerships: "CATEGORIES: {list}.",
      concepts: "CONCEPTS - use only the exact display name before the brackets; the bracketed phrases are what users say for it: {list}.",
      states: "PLACES: any place the user names, written in full."
    }
  }
};
var fillList = (template, list) => template.replace("{list}", list);
function describeCapabilities(capabilities) {
  if (!capabilities) {
    return "You may ONLY use the exact metric display names the platform declares.";
  }
  const words = (capabilities.prompts?.catalog ?? NEUTRAL_WORDING.catalog).full;
  const metricLines = capabilities.metrics.map((m) => `${m.displayName}${m.description ? ` (${m.description})` : ""}`).join("; ");
  const conceptLines = (capabilities.concepts ?? []).map((c) => `${c.displayName} (say any of: ${c.aliases.join(", ")}; supports ${c.metrics.join(" and ")})`).join("; ");
  return [
    fillList(words.metrics, metricLines),
    fillList(words.states, capabilities.states.join(", ")),
    fillList(words.ownerships, capabilities.ownerships.join(", ")),
    conceptLines ? fillList(words.concepts, conceptLines) : "",
    fillList(words.examples, capabilities.exampleAnswerableQuestions.join(" | ")),
    fillList(words.nonAnswerable, capabilities.nonAnswerableExamples.join(", "))
  ].filter(Boolean).join(" ");
}
function describeCapabilitiesCompact(capabilities) {
  if (!capabilities) {
    return describeCapabilities();
  }
  const words = (capabilities.prompts?.catalog ?? NEUTRAL_WORDING.catalog).compact;
  const conditions = (capabilities.concepts ?? []).map((c) => `${c.displayName} (${c.aliases.join(", ")})`).join("; ");
  return [
    fillList(words.metrics, capabilities.metrics.map((m) => m.displayName).join(", ")),
    fillList(words.ownerships, capabilities.ownerships.join(", ")),
    conditions ? fillList(words.concepts, conditions) : "",
    words.states
  ].filter(Boolean).join("\n");
}
var LLMModelGateway = class {
  /**
   * `chain` serves every role; `rewriteChain` serves the question-rewrite role
   * (normalizeMessyLanguage) only, `decorationChain` the suggestion roles and
   * `summaryChain` the summary role (Batch 5A-1). Each defaults to the one before,
   * so a gateway built with one chain - every existing caller and test - behaves
   * exactly as before.
   */
  constructor(chain = FALLBACK_CHAIN, rewriteChain = chain, decorationChain = chain, summaryChain = decorationChain) {
    this.chain = chain;
    this.rewriteChain = rewriteChain;
    this.decorationChain = decorationChain;
    this.summaryChain = summaryChain;
  }
  chain;
  rewriteChain;
  decorationChain;
  summaryChain;
  async complete(systemPrompt, userMessage, options = { temperature: 0.9 }) {
    return runChain(this.chain, systemPrompt, userMessage, options);
  }
  async completeJSON(systemPrompt, userMessage, options = { temperature: 0.9 }) {
    return this.runJSON(this.chain, systemPrompt, userMessage, options);
  }
  async runJSON(chain, systemPrompt, userMessage, options, trace) {
    const isValidJson = (content) => {
      try {
        JSON.parse(extractJsonBoundary(content));
        return true;
      } catch {
        return false;
      }
    };
    const raw = await runChain(chain, systemPrompt, userMessage, { ...options, jsonMode: true }, isValidJson, trace);
    return JSON.parse(extractJsonBoundary(raw));
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
  async normalizeMessyLanguage(question, capabilities) {
    const wording = capabilities?.prompts?.normalizer ?? NEUTRAL_WORDING.normalizer;
    const systemPrompt = [
      `You rewrite ONE user question about ${wording.subject} into ONE canonical question that a deterministic pipeline can resolve. You never answer questions, never write SQL, never invent facts.`,
      'Return ONLY this JSON, nothing else: {"status": "ok" | "need_clarification" | "unsupported", "canonical_question": string | null, "reason": string | null, "unsupported_terms": string[], "interpretation": string | null, "filler_dropped": string[], "closest": string[]}',
      "",
      ...wording.rules,
      "",
      ...wording.examples,
      "",
      describeCapabilitiesCompact(capabilities)
    ].join("\n");
    const startedAt = Date.now();
    const trace = { attempts: 0, tiers: [] };
    try {
      const result = await this.runJSON(
        this.rewriteChain,
        systemPrompt,
        question,
        { temperature: 0, forRewrite: true },
        trace
      );
      if (result && (result.status === "ok" || result.status === "need_clarification" || result.status === "fallback" || result.status === "unsupported")) {
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
  async synthesizeSuggestions(context, deadlineMs, wording) {
    if (context.candidates.length === 0) {
      return context.candidates;
    }
    const systemPrompt = (wording?.suggestionPhrasing ?? NEUTRAL_WORDING.suggestionPhrasing).join(" ");
    const userMessage = JSON.stringify({
      resolvedMetric: context.resolvedMetric,
      resolvedState: context.resolvedState,
      candidates: context.candidates
    });
    const startedAt = Date.now();
    const trace = { attempts: 0, tiers: [] };
    try {
      const result = await this.runJSON(this.decorationChain, systemPrompt, userMessage, { temperature: 0.6, deadlineMs }, trace);
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
  async summarizeResult(question, rows, deadlineMs, wording) {
    if (rows.length === 0) {
      return "";
    }
    const systemPrompt = (wording?.summary ?? NEUTRAL_WORDING.summary).join(" ");
    const userMessage = JSON.stringify({ question, rows: rows.slice(0, 20) });
    const startedAt = Date.now();
    const trace = { attempts: 0, tiers: [] };
    try {
      const summary = await runChain(this.summaryChain, systemPrompt, userMessage, { temperature: 0.2, deadlineMs }, void 0, trace);
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
  async handleConversational(question, capabilities) {
    const conversational = capabilities.prompts?.conversational ?? NEUTRAL_WORDING.conversational;
    const systemPrompt = [
      ...conversational.intro,
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
      ...conversational.outro
    ].join(" ");
    const fallback = {
      answer: conversational.fallbackAnswer,
      suggestions: capabilities.exampleAnswerableQuestions.slice(0, 4)
    };
    const startedAt = Date.now();
    const trace = { attempts: 0, tiers: [] };
    try {
      const result = await this.runJSON(this.chain, systemPrompt, question, { temperature: 0.8 }, trace);
      if (typeof result?.answer === "string" && result.answer.length > 0 && Array.isArray(result.suggestions) && result.suggestions.every((s) => typeof s === "string" && s.length > 0)) {
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
  async selectAndRephraseSuggestions(pool, context, count = 3, deadlineMs, wording) {
    const fallback = pool.slice(0, count);
    if (pool.length <= count) {
      return pool;
    }
    const systemPrompt = (wording?.suggestionSelector ?? NEUTRAL_WORDING.suggestionSelector).join(" ").replace("{count}", String(count));
    const userMessage = JSON.stringify({
      resolvedMetric: context.resolvedMetric,
      resolvedState: context.resolvedState,
      pool,
      numberToSelect: count
    });
    const startedAt = Date.now();
    const trace = { attempts: 0, tiers: [] };
    try {
      const result = await this.runJSON(this.decorationChain, systemPrompt, userMessage, { temperature: 0.8, deadlineMs }, trace);
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
};
var llmGateway = new LLMModelGateway(FALLBACK_CHAIN, NORMALIZER_CHAIN, DECORATION_CHAIN, SUMMARY_CHAIN);
export {
  AICREDITS_NORMALIZER_TIERS,
  AICREDITS_QWEN_30B_TIER,
  AICREDITS_QWEN_FLASH_DECORATION_TIER,
  AICREDITS_QWEN_FLASH_SUMMARY_TIER,
  AICREDITS_QWEN_FLASH_TIER,
  DECORATION_CHAIN,
  FALLBACK_CHAIN,
  LLMModelGateway,
  NORMALIZER_CHAIN,
  SUMMARY_CHAIN,
  llmGateway,
  withLlmCallLog
};
