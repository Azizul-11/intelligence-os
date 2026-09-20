/**
 * Batch 1 (Step 1.3): maps the LLM gateway's normalizer result onto the narrow shape Universal
 * Core's optional `llmFallback` hook accepts. Pure and dependency-free, so the deployed function
 * (`domain-registry.ts`) and the local-live harness share ONE implementation.
 *
 * - `unsupported_terms` is the LLM's report of what the question asks for that the catalog cannot
 *   answer, made alongside whatever status it chose. A reported term that names a topic the domain's
 *   own catalog lists as unsupported (`capabilities.unsupportedTopics`, exact phrase on word
 *   boundaries) makes the result BINDING (`{ unsupportedTerms }`, under any status): the engine refuses
 *   instead of answering the rest of the question, where those words would be silently dropped and a
 *   broader answer returned (a stroke question answered as generic mortality, `cleanest` rewritten to
 *   Safety). The LLM is not trusted alone: measured on the 600-query baseline it over-reports (it
 *   listed "state-by-state view", "better-rated", "satisfied with their care" for questions the
 *   platform answers correctly), and a false refusal breaks a working answer.
 * - Any other `fallback` keeps its previous meaning ("no usable answer": the deterministic pipeline
 *   still gets its turn on the original text). Some correct answers depend on that.
 * - A response without the field behaves exactly as before, so the gateway change is backward compatible.
 */
export interface NormalizerResultLike {
  status: "ok" | "need_clarification" | "fallback";
  canonical_question?: string | null;
  reason?: string | null;
  unsupported_terms?: readonly unknown[] | null;
  provenance?: Readonly<Record<string, string | number | boolean>>;
}

export interface UnsupportedTopicCatalog {
  unsupportedTopics?: readonly string[];
}

type Meta = { meta: Record<string, string | number | boolean> };

export type NormalizerHookResult =
  | ({ unsupportedTerms: string[] } & Partial<Meta>)
  | ({ canonicalQuestion: string } & Partial<Meta>)
  | ({ clarification: string } & Partial<Meta>)
  | Meta
  | null;

const words = (text: string): string => ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;

/** True when the term contains the topic as whole words (never a substring of a longer word). */
function namesTopic(term: string, topics: readonly string[]): boolean {
  const padded = words(term);
  return topics.some((topic) => padded.includes(words(topic)));
}

export function mapNormalizerResult(result: NormalizerResultLike, catalog?: UnsupportedTopicCatalog): NormalizerHookResult {
  const meta: Partial<Meta> = result.provenance ? { meta: { ...result.provenance } } : {};
  const topics = catalog?.unsupportedTopics ?? [];
  const terms = (result.unsupported_terms ?? [])
    .map((term) => String(term).trim())
    .filter((term) => term.length > 0 && namesTopic(term, topics));

  if (terms.length > 0) {
    return { unsupportedTerms: terms, ...meta };
  }
  if (result.status === "ok" && result.canonical_question) {
    return { canonicalQuestion: result.canonical_question, ...meta };
  }
  if (result.status === "need_clarification" && result.reason) {
    return { clarification: result.reason, ...meta };
  }
  return result.provenance ? { meta: { ...result.provenance } } : null;
}

/**
 * Batch 3 (Step 3.0): deterministic pre-check. The domain's own catalog lists what it knows it cannot answer
 * (`unsupportedTopics`); when the RAW question names one of those topics, exact phrase on word boundaries, the
 * question is refused before any LLM call: 0 SQL, 0 tokens, and the refusal no longer depends on whether the
 * model chose to report the topic (removing the topic list from the prompt in Batch 2 made that report unreliable).
 * Every matched topic is returned except one that is only part of a longer matched topic ("communication" inside
 * "nurse communication"); "birthing friendly" and "birthing-friendly" normalize to the same words and count once.
 */
export function precheckUnsupported(question: string, catalog?: UnsupportedTopicCatalog): string[] {
  const padded = words(question);
  const seen = new Set<string>();
  const hits: string[] = [];

  for (const topic of catalog?.unsupportedTopics ?? []) {
    const key = words(topic);

    if (padded.includes(key) && !seen.has(key)) {
      seen.add(key);
      hits.push(topic);
    }
  }

  return hits.filter((topic) => !hits.some((other) => other !== topic && words(other).length > words(topic).length && words(other).includes(words(topic))));
}

/**
 * The whole `llmFallback` body, shared by the deployed function and the local-live harness: pre-check first, then
 * the normalizer (`normalize` is the gateway call), then the Batch 1 mapping. A pre-check refusal is the same
 * `{ unsupportedTerms }` shape the engine already treats as a binding refusal; `meta.source` marks it in the trace
 * (`llm-normalization` = `unsupported`, no provider or latency because no model was called).
 */
export async function normalizeQuestion(
  question: string,
  catalog: UnsupportedTopicCatalog | undefined,
  normalize: (question: string) => Promise<NormalizerResultLike>,
): Promise<NormalizerHookResult> {
  const hits = precheckUnsupported(question, catalog);

  if (hits.length > 0) {
    return { unsupportedTerms: hits, meta: { source: "pre-check" } };
  }

  return mapNormalizerResult(await normalize(question), catalog);
}
