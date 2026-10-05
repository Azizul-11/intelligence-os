/** Batch 1 (Step 1.3): maps the gateway's normalizer result onto Universal Core's `llmFallback` shape; pure, shared by the deployed function and the local-live harness.
 * An `unsupported_terms` entry naming a catalog-unsupported topic makes the result BINDING (the LLM alone is not trusted: it over-reports); any other `fallback` still means "no usable answer". */
import { mapLayLanguage, type LayVocabularyLike } from "./lay-mapper.ts";

export interface NormalizerResultLike {
  status: "ok" | "need_clarification" | "fallback" | "unsupported";
  canonical_question?: string | null;
  reason?: string | null;
  unsupported_terms?: readonly unknown[] | null;
  /** Batch 5A-1: how the model read a plain phrase, and the filler it dropped. */
  interpretation?: string | null;
  filler_dropped?: readonly unknown[] | null;
  /** Batch 5A-2: on "unsupported", the canonical questions nearest to what was asked; they become the one-tap alternates. */
  closest?: readonly unknown[] | null;
  provenance?: Readonly<Record<string, string | number | boolean>>;
}

export interface UnsupportedTopicCatalog {
  unsupportedTopics?: readonly string[];
  /** 2,000 sweep (Batch A2): a refused topic word ("since", "doctors") is not the topic when one of these phrases is also present; keyed by topic. */
  unsupportedTopicExceptions?: Readonly<Record<string, readonly string[]>>;
  /** Batch 5A-1: the layperson vocabulary the domain owns (see services/lay-mapper.ts). */
  layVocabulary?: LayVocabularyLike;
  /** Batch 5A-1: the domain's place names (its states), so a leftover place word is recognised as a slot. */
  states?: readonly string[];
  /** 2,000 sweep (Batch C): the domain's two-letter place codes, for a code typed in lower case at the end of a question. */
  stateCodes?: readonly string[];
  /** 2,000 sweep (Batch D): the domain's lower-case city names, for a city typed in lower case before such a code. */
  cityNames?: readonly string[];
  /** Batch 5A-2: how a model-written canonical question the pipeline cannot rank is rewritten, with the plain note replacing the model's reading; model rewrites only. */
  canonicalRepairs?: readonly { pattern: string; flags?: string; replacement: string; note: string }[];
  /** 2,000 sweep (Batch D): an ambiguous word; a model rewrite of a question with `term` and none of `unless` is answered with `reason` as a clarification. */
  ambiguousTerms?: readonly { term: string; unless: readonly string[]; reason: string; caseSensitive?: boolean }[];
  /** 2,000 sweep (Batch E): unsupported topics no literal can list (a year); regular-expression sources, matched on the lower-case question. */
  unsupportedPatterns?: readonly string[];
  /** Batch Normalizer Enhancement: a keyed topic is a refusal only with one of these companion words ("years ago" alone is a narrative connector,
   * with "better"/"trend" it asks for a historical snapshot we do not hold); unkeyed topics are refused alone. */
  unsupportedTopicRequires?: Readonly<Record<string, readonly string[]>>;
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
function namesTopic(term: string, topics: readonly string[], catalog?: UnsupportedTopicCatalog): boolean {
  const padded = words(term);
  return topics.some((topic) => padded.includes(words(topic)) && !excepted(padded, topic, catalog));
}

/** True when the (already padded) text uses the topic word in one of the domain's non-topic phrases. */
function excepted(padded: string, topic: string, catalog?: UnsupportedTopicCatalog): boolean {
  return (catalog?.unsupportedTopicExceptions?.[topic] ?? []).some((phrase) => padded.includes(words(phrase)));
}

/** True (the default) unless the topic is keyed in `unsupportedTopicRequires` and none of its companion words appear. */
function hasRequiredCompanion(padded: string, topic: string, catalog?: UnsupportedTopicCatalog): boolean {
  const companions = catalog?.unsupportedTopicRequires?.[topic];
  return !companions || companions.some((word) => padded.includes(words(word)));
}

/**
 * The trace detail for a model answer: the provenance (which tier answered), plus (Batch 5A-1, R10) what the model
 * itself said, which the trace never showed before: `reason`, `unsupported_terms` (as reported, binding or not),
 * `interpretation` and `filler_dropped`. Only what is present is added, so a result without those fields has exactly
 * the meta it always had.
 */
function metaOf(result: NormalizerResultLike): Partial<Meta> {
  const extras: Record<string, string> = {};
  const text = (value: unknown, max: number): string => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const list = (values: readonly unknown[] | null | undefined, max: number): string =>
    (values ?? []).map((value) => String(value).trim()).filter(Boolean).join("; ").slice(0, max);

  if (text(result.reason, 200)) extras.reason = text(result.reason, 200);
  if (list(result.unsupported_terms, 300)) extras.unsupported_terms = list(result.unsupported_terms, 300);
  // The note is shown to the user as plain text: nothing that reads as markup.
  if (text(result.interpretation, 200) && !/[*_`#<>]/.test(text(result.interpretation, 200))) extras.interpretation = text(result.interpretation, 200);
  if (list(result.filler_dropped, 200)) extras.filler_dropped = list(result.filler_dropped, 200);
  // Complete questions the caller dry-runs before showing (at most 3, one per line, the same field the layperson mapping uses).
  const closest = (result.closest ?? []).map((question) => String(question).trim()).filter((question) => question.length > 0 && question.length <= 200);
  if (closest.length > 0) extras.alternates = closest.slice(0, 3).join("\n");

  return result.provenance || Object.keys(extras).length > 0 ? { meta: { ...(result.provenance ?? {}), ...extras } } : {};
}

export function mapNormalizerResult(result: NormalizerResultLike, catalog?: UnsupportedTopicCatalog): NormalizerHookResult {
  const meta: Partial<Meta> = metaOf(result);
  const topics = catalog?.unsupportedTopics ?? [];
  const terms = (result.unsupported_terms ?? [])
    .map((term) => String(term).trim())
    .filter((term) => term.length > 0 && namesTopic(term, topics, catalog));

  if (terms.length > 0) {
    return { unsupportedTerms: terms, ...meta };
  }
  if (result.status === "ok" && result.canonical_question) {
    return { canonicalQuestion: result.canonical_question, ...meta };
  }
  if (result.status === "need_clarification" && result.reason) {
    return { clarification: result.reason, ...meta };
  }
  return meta.meta ? { meta: meta.meta } : null;
}

/** Batch 5A-2: repairs the model's canonical question when the domain says it names something unrankable; the plain note replaces the model's reading
 * and the original is kept in the trace (`repaired`). */
export function repairCanonical(result: NormalizerHookResult, catalog?: UnsupportedTopicCatalog): NormalizerHookResult {
  if (!result || !("canonicalQuestion" in result)) {
    return result;
  }

  for (const repair of catalog?.canonicalRepairs ?? []) {
    const pattern = new RegExp(repair.pattern, repair.flags);

    if (pattern.test(result.canonicalQuestion)) {
      const meta = { ...(result.meta ?? {}) } as Record<string, string | number | boolean>;
      delete meta.interpretation;

      return {
        canonicalQuestion: result.canonicalQuestion.replace(pattern, repair.replacement),
        meta: { ...meta, interpretation: repair.note, repaired: result.canonicalQuestion.slice(0, 200) },
      };
    }
  }

  return result;
}

/** Batch 3 (Step 3.0): deterministic pre-check; a RAW question naming a topic in `unsupportedTopics` (exact phrase, word boundaries) is refused before any LLM call (0 SQL, 0 tokens).
 * Matched topics are all returned except one contained in a longer matched topic; "birthing friendly"/"birthing-friendly" count once. */
export function precheckUnsupported(question: string, catalog?: UnsupportedTopicCatalog): string[] {
  const padded = words(question);
  const seen = new Set<string>();
  const hits: string[] = [];

  for (const topic of catalog?.unsupportedTopics ?? []) {
    const key = words(topic);

    if (padded.includes(key) && !seen.has(key) && !excepted(padded, topic, catalog) && hasRequiredCompanion(padded, topic, catalog)) {
      seen.add(key);
      hits.push(topic);
    }
  }

  for (const pattern of catalog?.unsupportedPatterns ?? []) {
    const match = question.toLowerCase().match(new RegExp(pattern, "u"));

    if (match && !seen.has(match[0])) {
      seen.add(match[0]);
      hits.push(match[0]);
    }
  }

  return hits.filter((topic) => !hits.some((other) => other !== topic && words(other).length > words(topic).length && words(other).includes(words(topic))));
}

/** The whole `llmFallback` body, shared by the deployed function and the local-live harness: pre-check (binding `{ unsupportedTerms }`, `meta.source` marks it in the trace),
 * then the free lay vocabulary (Batch 5A-1), then the normalizer (`normalize` is the gateway call), then the Batch 1 mapping; what the vocabulary cannot map without guessing goes to the model. */
export async function normalizeQuestion(
  question: string,
  catalog: UnsupportedTopicCatalog | undefined,
  normalize: (question: string) => Promise<NormalizerResultLike>,
): Promise<NormalizerHookResult> {
  const hits = precheckUnsupported(question, catalog);

  if (hits.length > 0) {
    return { unsupportedTerms: hits, meta: { source: "pre-check" } };
  }

  const lay = catalog?.layVocabulary
    ? mapLayLanguage(question, catalog.layVocabulary, {
        placeWords: new Set((catalog.states ?? []).flatMap((state) => state.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean))),
        placeCodes: new Set((catalog.stateCodes ?? []).map((code) => code.toLowerCase())),
        cityNames: catalog.cityNames ? new Set(catalog.cityNames) : undefined,
      })
    : undefined;
  const corrected = lay && lay.corrections.length > 0 ? lay.corrections.join("; ") : undefined;

  if (lay && corrected) {
    const correctedHits = precheckUnsupported(lay.correctedText, catalog);

    if (correctedHits.length > 0) {
      return { unsupportedTerms: correctedHits, meta: { source: "pre-check", corrected } };
    }
  }

  if (lay?.mapped) {
    const { canonicalQuestion, group, heard, interpretation, fillerDropped, alternates } = lay.mapped;

    return {
      canonicalQuestion,
      meta: {
        source: "lay-vocabulary",
        group,
        heard,
        ...(interpretation ? { interpretation } : {}),
        ...(fillerDropped.length > 0 ? { filler_dropped: fillerDropped.join("; ") } : {}),
        ...(corrected ? { corrected } : {}),
        ...(alternates.length > 0 ? { alternates: alternates.join("\n") } : {}),
      },
    };
  }

  let result = repairCanonical(mapNormalizerResult(await normalize(lay?.correctedText ?? question), catalog), catalog);
  const padded = words(lay?.correctedText ?? question);
  const ambiguous = (catalog?.ambiguousTerms ?? []).find(
    ({ term, unless, caseSensitive }) =>
      (caseSensitive ? ` ${question.replace(/[^\p{L}\p{N}]+/gu, " ")} `.includes(` ${term} `) : padded.includes(words(term))) &&
      !unless.some((word) => padded.includes(words(word))),
  );

  if (ambiguous && result && "canonicalQuestion" in result) {
    result = { clarification: ambiguous.reason, meta: { ...result.meta, ambiguousTerm: ambiguous.term } };
  }

  if (!corrected) {
    return result;
  }

  return result === null ? { meta: { corrected } } : ({ ...result, meta: { ...("meta" in result ? result.meta : {}), corrected } } as NormalizerHookResult);
}
