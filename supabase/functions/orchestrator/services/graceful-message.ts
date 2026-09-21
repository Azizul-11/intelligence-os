/**
 * Batch 5A-1: the wording of the graceful replies. Pure and dependency-free like normalizer-hook.ts, and generic: it
 * knows no domain word, only the guidance and coverage sentence the domain hands in (`DOMAIN_CAPABILITIES.scopeGuidance`
 * and `.coverageSummary`).
 *
 * Plain text, on purpose: apps/web renders `summary` and `error` in a bare <p>, so markdown would show as literal
 * asterisks. The tappable questions are the response's `suggestions`; these sentences only introduce them.
 */

export interface ScopeGuidanceLike {
  topics: readonly string[];
  /** How to name what the user asked for; `{term}` is replaced by the topic phrase found in the question. */
  label?: string;
  chips: readonly string[];
}

const words = (text: string): string => ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;

/** The guidance entry that answers for a topic named in `text`, with the topic phrase that matched (whole words). */
export function findScopeGuidance(text: string, guidance: readonly ScopeGuidanceLike[]): { entry: ScopeGuidanceLike; topic: string } | undefined {
  const padded = words(text);

  for (const entry of guidance) {
    const topic = entry.topics.find((candidate) => padded.includes(words(candidate)));

    if (topic !== undefined) {
      return { entry, topic };
    }
  }

  return undefined;
}

const TRAILER = "Try one of the questions below.";

/** "I understand you're looking for stroke hospitals, but I currently track <coverage>. Try one of the questions below." */
export function buildScopeMessage(terms: readonly string[], guidance: readonly ScopeGuidanceLike[], coverage: string | undefined): string {
  const asked = terms.join(" ");
  const found = findScopeGuidance(asked, guidance);
  const label = found?.entry.label !== undefined ? found.entry.label.replace("{term}", found.topic) : `"${asked}"`;
  const tracked = coverage ? ` I currently track ${coverage}.` : "";

  return `I understand you're looking for ${label}, but I don't have that.${tracked} ${TRAILER}`;
}

/** The pipeline could not match some words of the question and refused rather than answer without them. */
export function buildUnaccountedMessage(unaccounted: readonly string[], coverage: string | undefined): string {
  const tracked = coverage ? ` I currently track ${coverage}.` : "";

  return `I couldn't match "${unaccounted.join(" ")}" to something I track.${tracked} ${TRAILER}`;
}

/** An answer was given, but the front door could not read these words: say so instead of dropping them silently. */
export function buildIgnoredNote(unaccounted: readonly string[]): string {
  return `I didn't match "${unaccounted.join(" ")}" to something I track, so this answer leaves it out.`;
}

/**
 * Batch 5A-2: words the model reported as unsupported but whose rewrite went ahead without them ("mental health" in
 * "mental health hospitals in Florida"): the answer is a broader one than asked for, so it says so. A term the model
 * already explained in its own reading, or one still in the canonical question, is not reported twice.
 */
export function droppedTerms(terms: readonly string[], interpretation: string | undefined, canonicalQuestion: string | undefined, question?: string): string[] {
  const covered = words(`${interpretation ?? ""} ${canonicalQuestion ?? ""}`);
  const typed = question === undefined ? undefined : words(question);

  // only the user's own words are reported back: a model that reports a term the question does not contain is over-reporting
  return terms.map((term) => term.trim()).filter((term) => term.length > 0 && !covered.includes(words(term)) && (typed === undefined || typed.includes(words(term))));
}

type GateLike = { status: string; detail?: Record<string, unknown> } | undefined;

/** The one-tap questions an llm-normalization trace entry carries: a layperson mapping's alternates, or the model's `closest`. */
export function gateAlternates(gate: GateLike): string[] {
  const alternates = gate?.detail?.alternates;

  return typeof alternates === "string" ? alternates.split("\n").filter(Boolean) : [];
}

/**
 * Batch 5A-2: the model understood what was asked for ("free parking") but the domain lists no such topic, so the pipeline
 * ended at its generic dead end. Echo the intent instead of the static "I specialize in ..." card. Only that generic card
 * (`genericErrors`) is replaced: a clarification or any other specific message the pipeline produced is left alone, and a
 * provider failure or an off-topic decline carries no reading to echo.
 */
export function buildInterpretedRefusal(
  gate: GateLike,
  error: string | undefined,
  genericErrors: ReadonlySet<string>,
  coverage: string | undefined,
  question: string,
): string | undefined {
  const asked = gate?.status === "unavailable" ? groundedAsk(gate.detail, question) : "";

  if (!asked || !error || !genericErrors.has(error)) {
    return undefined;
  }

  return buildScopeMessage([asked], [], coverage);
}

/**
 * What to echo back: the model's `unsupported_terms` (the user's own words, copied) that really are in the question, else its
 * reading if every longer word of it is in the question. A model can copy a prompt example into its reading ("a helipad" for
 * "free parking"), so nothing that is not in what the user typed is ever quoted back to them.
 */
function groundedAsk(detail: Record<string, unknown> | undefined, question: string): string {
  const typed = words(question);
  const size = typed.trim().split(" ").length;
  // a topic is a part of the question; one that is most of it ("who won the game last night") is an off-topic ask, not something wanted
  const isTopic = (text: string) => text.trim().split(" ").length < 0.6 * size;
  const terms = String(detail?.unsupported_terms ?? "")
    .split("; ")
    .map((term) => term.trim())
    .filter((term) => term.length > 0 && typed.includes(words(term)) && isTopic(words(term)));

  if (terms.length > 0) {
    return terms.slice(0, 2).join(" and ");
  }

  const reading = typeof detail?.interpretation === "string" ? detail.interpretation.trim() : "";
  const longer = (text: string) => text.trim().split(" ").filter((word) => word.length >= 4);
  const content = longer(words(reading));

  // the reading is judged on its longer words ("a cardiologist" -> "cardiologist"), against the question's longer words
  return reading.length > 0 && content.length > 0 && content.every((word) => typed.includes(` ${word} `)) && content.length < 0.6 * longer(typed).length ? reading : "";
}

/** The summary field: what the phrase was read as, what was left out, the tie disclosure, then the model's sentence(s). */
export function composeSummary(...parts: readonly (string | undefined)[]): string | undefined {
  const present = parts.filter((part): part is string => typeof part === "string" && part.trim().length > 0).map((part) => part.trim());
  // every part but the last is a note that ends a sentence (a model's note may not: "Read 'x' as y")
  const text = present.map((part, index) => (index < present.length - 1 && !/[.!?]$/.test(part) ? `${part}.` : part)).join(" ");

  return text.length > 0 ? text : undefined;
}
