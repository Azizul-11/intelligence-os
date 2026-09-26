/**
 * Batch 5A-1: the generic layperson-language mapper. Pure and dependency-free (like normalizer-hook.ts, which calls it),
 * so the deployed function and the local harnesses share ONE implementation. It knows no domain word: everything it
 * matches comes from the vocabulary the domain hands in (`DOMAIN_CAPABILITIES.layVocabulary`), exact phrases on whole
 * words, never fuzzily.
 *
 * What it does with a question, in this order:
 *  1. corrects exact misspellings ("penumonia" -> "pneumonia", "chruch" -> "church") in place;
 *  2. finds the layperson phrase(s) ("heart problem", "trouble breathing", "good hospital", "pneumonia" + "checkup");
 *  3. drops the request's scaffolding ("can you show me", "please") and the filler that asks for nothing measurable
 *     ("checkup", "screening", "problem"), reporting the filler;
 *  4. rewrites the question to the canonical one the deterministic pipeline answers, appending everything else the
 *     user typed (a state, a city, an ownership word), so no place or ownership is ever dropped or invented;
 *  5. builds the one-line note that says what the phrase was read as, and the alternatives to offer.
 *
 * It refuses to rewrite (returns no mapping and the model / pipeline decide) when it cannot do so without guessing:
 * two phrases that map to different questions, a metric / direction / comparison word the user typed ("worst",
 * "readmissions", "vs"), or a number left over ("top 5").
 */

export interface LayAlternateLike {
  label: string;
  base: string;
}

export interface LayGroupLike {
  id: string;
  phrases: readonly string[];
  base: string;
  reading: string;
  alternates?: readonly LayAlternateLike[];
  note?: string;
  silent?: boolean;
  priority?: number;
  /** A generic group ("good hospital", "near me") yields to any specific group matched in the same question. */
  generic?: boolean;
  notFollowedBy?: readonly string[];
}

export interface LayVocabularyLike {
  spellings: Readonly<Record<string, string>>;
  groups: readonly LayGroupLike[];
  scaffold: readonly string[];
  /** Health words dropped and reported; the ones next to a phrase are quoted with it ("pneumonia screening"). */
  filler: readonly string[];
  /** Narration dropped and reported, never quoted ("my dad has ... easily"). */
  narration?: readonly string[];
  blockers: readonly string[];
  /** Words (or phrases) that may stay next to a mapped phrase because the pipeline resolves them (ownership). */
  slotWords: readonly string[];
}

export interface LayMapOptions {
  /** Lower-case words of the places the domain knows (state names); a leftover word outside them and the slot words must look like a proper name. */
  placeWords?: ReadonlySet<string>;
  /**
   * 2,000 sweep (Batch C): lower-case two-letter place codes (state codes). Accepted only as the LAST leftover word, in any
   * case ("side effects explained nv"), and written upper-case in the rewrite, where the pipeline resolves the code.
   */
  placeCodes?: ReadonlySet<string>;
  /** 2,000 sweep (Batch D): lower-case names of the cities the domain knows, for a city typed in lower case before such a code. */
  cityNames?: ReadonlySet<string>;
}

export interface LayMapping {
  canonicalQuestion: string;
  group: string;
  /** The note shown to the user; absent for a plain synonym. */
  interpretation?: string;
  /** The user's own wording of the phrase, e.g. "penumonia checkup". */
  heard: string;
  fillerDropped: string[];
  /** Complete questions for the one-tap alternatives (the user's place is already appended). */
  alternates: string[];
}

export interface LayMapResult {
  /** The question with its misspellings corrected; identical to the input when none was found. */
  correctedText: string;
  corrections: string[];
  mapped?: LayMapping;
}

interface Token {
  /** Current text (a corrected word replaces the typed one). */
  text: string;
  lower: string;
  /** What the user typed for this token; empty for the 2nd+ word a correction expanded into. */
  typed: string;
}

const WORD = /[\p{L}\p{N}]+/gu;
const TRAILING_PREPOSITIONS = new Set(["in", "at", "near", "around", "within", "on", "from", "to", "of", "by"]);
const QUOTE_PREPOSITIONS = new Set(["for", "about", "of", "with", "to"]);

function tokenize(text: string): { token: Token; start: number; end: number }[] {
  return [...text.matchAll(WORD)].map((m) => ({
    token: { text: m[0], lower: m[0].toLowerCase(), typed: m[0] },
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));
}

function startsWithWords(tokens: readonly Token[], at: number, words: readonly string[]): boolean {
  return at + words.length <= tokens.length && words.every((word, offset) => tokens[at + offset].lower === word);
}

function capitalizeLike(typed: string, replacement: string): string {
  return /^\p{Lu}/u.test(typed) ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement;
}

/** "a", "a or b", "a, b, or c". */
export function joinLabels(labels: readonly string[]): string {
  return labels.length <= 1 ? (labels[0] ?? "") : labels.length === 2 ? `${labels[0]} or ${labels[1]}` : `${labels.slice(0, -1).join(", ")}, or ${labels[labels.length - 1]}`;
}

/** A leftover word the pipeline can be trusted to resolve as a slot: a preposition, an ownership word, a place, a code or a proper name. */
function isSlotToken(token: Token, slotWords: ReadonlySet<string>, placeWords: ReadonlySet<string>): boolean {
  return (
    TRAILING_PREPOSITIONS.has(token.lower) ||
    slotWords.has(token.lower) ||
    placeWords.has(token.lower) ||
    /^\p{Lu}{2}$/u.test(token.text) ||
    /^\p{Lu}\p{Ll}+$/u.test(token.text)
  );
}

export function mapLayLanguage(question: string, vocabulary: LayVocabularyLike, options: LayMapOptions = {}): LayMapResult {
  // ---- 1. spellings: exact phrases, longest first, spliced into the original text so punctuation and case survive
  const spellingEntries = Object.entries(vocabulary.spellings)
    .map(([from, to]) => ({ words: from.split(" "), to }))
    .sort((a, b) => b.words.length - a.words.length);
  const spans = tokenize(question);
  const tokens: Token[] = [];
  const corrections: string[] = [];
  const splices: { start: number; end: number; text: string }[] = [];

  for (let i = 0; i < spans.length; ) {
    const entry = spellingEntries.find((candidate) => startsWithWords(spans.map((s) => s.token), i, candidate.words));

    if (!entry) {
      tokens.push(spans[i].token);
      i += 1;
      continue;
    }

    const covered = spans.slice(i, i + entry.words.length);
    const typed = covered.map((s) => s.token.typed).join(" ");
    const replacement = capitalizeLike(typed, entry.to);
    corrections.push(`${typed} > ${entry.to}`);
    splices.push({ start: covered[0].start, end: covered[covered.length - 1].end, text: replacement });
    replacement.split(" ").forEach((word, index) => tokens.push({ text: word, lower: word.toLowerCase(), typed: index === 0 ? typed : "" }));
    i += entry.words.length;
  }

  const correctedText = splices.reduceRight((text, s) => text.slice(0, s.start) + s.text + text.slice(s.end), question);

  // ---- 2. layperson phrases, longest first
  const phraseEntries = vocabulary.groups
    .flatMap((group) => group.phrases.map((phrase) => ({ group, words: phrase.split(" ") })))
    .sort((a, b) => b.words.length - a.words.length);
  const matches: { group: LayGroupLike; start: number; end: number }[] = [];

  for (let i = 0; i < tokens.length; ) {
    const hit = phraseEntries.find(
      (entry) =>
        startsWithWords(tokens, i, entry.words) &&
        !(entry.group.notFollowedBy ?? []).includes(tokens[i + entry.words.length]?.lower ?? ""),
    );

    if (!hit) {
      i += 1;
      continue;
    }

    matches.push({ group: hit.group, start: i, end: i + hit.words.length });
    i += hit.words.length;
  }

  // A generic phrase ("good hospital") yields to a specific one ("chest pain") in the same question.
  if (matches.some((m) => !m.group.generic)) {
    for (let k = matches.length - 1; k >= 0; k--) {
      if (matches[k].group.generic) matches.splice(k, 1);
    }
  }

  if (matches.length === 0 || new Set(matches.map((m) => m.group.base)).size !== 1) {
    return { correctedText, corrections };
  }

  // ---- 3. what is left of the question
  const consumed = new Set<number>();
  matches.forEach((m) => {
    for (let k = m.start; k < m.end; k++) consumed.add(k);
  });
  const scaffold = new Set(vocabulary.scaffold);
  const filler = new Set(vocabulary.filler);
  const narration = new Set(vocabulary.narration ?? []);
  const blockers = new Set(vocabulary.blockers);
  const singleSlotWords = new Set(vocabulary.slotWords.filter((word) => !word.includes(" ")));
  const placeWords = options.placeWords ?? new Set<string>();
  const residual: Token[] = [];
  const fillerDropped: string[] = [];

  // A multi-word slot phrase ("for profit") is kept whole, whatever the scaffold list says about one of its words.
  const kept = new Set<number>();
  for (const phrase of vocabulary.slotWords.filter((word) => word.includes(" "))) {
    const words = phrase.split(" ");
    for (let k = 0; k < tokens.length; k++) {
      if (!consumed.has(k) && startsWithWords(tokens, k, words)) words.forEach((_, offset) => kept.add(k + offset));
    }
  }

  for (let k = 0; k < tokens.length; k++) {
    if (consumed.has(k)) continue;
    const token = tokens[k];
    if (blockers.has(token.lower) || /^\d+$/.test(token.lower)) {
      return { correctedText, corrections };
    }
    if (kept.has(k)) {
      residual.push(token);
    } else if (filler.has(token.lower) || narration.has(token.lower)) {
      if (token.typed !== "") fillerDropped.push(token.typed);
    } else if (!scaffold.has(token.lower)) {
      residual.push(token);
    }
  }

  // What is left must be slots the pipeline resolves. Anything else (a word the vocabulary has never seen) is not
  // guessed at: no rewrite, and the model reads the whole sentence.
  // The question's own last word, not merely the last one left over ("ok so I'm trying..." is never Oklahoma).
  const last = tokens[tokens.length - 1];
  const trailingCode = (token: Token): boolean => token === last && (options.placeCodes?.has(token.lower) ?? false);
  // 2,000 sweep (Batch D): the lower-case words right before that final code are its city when they name one the domain
  // knows ("psi 90 score el paso tx"): written as a name, and the code (even "in") is kept, as if both had been typed
  // capitalised. The longest known name wins; a word before it that names nothing still sends the question to the model.
  const cityWords = new Set<Token>();
  if (trailingCode(last) && options.cityNames) {
    const run: Token[] = [];
    for (let k = tokens.length - 2; k >= 0 && run.length < 3; k--) {
      if (!residual.includes(tokens[k]) || kept.has(k) || !/^\p{Ll}+$/u.test(tokens[k].text) || isSlotToken(tokens[k], singleSlotWords, placeWords)) break;
      run.unshift(tokens[k]);
    }
    const name = [0, 1, 2].map((from) => run.slice(from)).find((words) => words.length > 0 && options.cityNames?.has(words.map((t) => t.lower).join(" ")));
    name?.forEach((token) => cityWords.add(token));
  }

  while (residual.length > 0 && TRAILING_PREPOSITIONS.has(residual[residual.length - 1].lower) && !(cityWords.size > 0 && residual[residual.length - 1] === last)) {
    residual.pop();
  }

  if (residual.some((token) => !kept.has(tokens.indexOf(token)) && !isSlotToken(token, singleSlotWords, placeWords) && !trailingCode(token) && !cityWords.has(token))) {
    return { correctedText, corrections };
  }

  const written = (token: Token): string =>
    trailingCode(token) ? token.text.toUpperCase() : cityWords.has(token) ? token.text.charAt(0).toUpperCase() + token.text.slice(1) : token.text;
  const suffix = residual.length > 0 ? ` ${residual.map(written).join(" ")}` : "";
  // Same base, several groups ("good hospital near me"): the highest priority supplies the note, else the first with one.
  const primaryMatch = [...matches].sort((a, b) => (b.group.priority ?? 0) - (a.group.priority ?? 0)).find((m) => m.group.note !== undefined) ?? matches[0];
  const primary = primaryMatch.group;

  // ---- 4. the wording to quote: the phrase plus the filler right next to it, without the request's scaffolding
  let from = primaryMatch.start;
  let to = primaryMatch.end;
  while (from > 0 && !consumed.has(from - 1) && filler.has(tokens[from - 1].lower)) from -= 1;
  while (to < tokens.length && !consumed.has(to) && filler.has(tokens[to].lower)) to += 1;
  const quoted = tokens.slice(from, to);
  // Only a leading / trailing preposition is trimmed ("for heart" -> "heart"); "good hospital", "near me" stay whole.
  while (quoted.length > 1 && QUOTE_PREPOSITIONS.has(quoted[0].lower)) quoted.shift();
  while (quoted.length > 1 && QUOTE_PREPOSITIONS.has(quoted[quoted.length - 1].lower)) quoted.pop();
  // `typed` is empty for the 2nd+ word a correction expanded into: the user typed one thing, quote it once.
  const heard = quoted.map((t) => t.typed).filter(Boolean).join(" ");

  const alternates = (primary.alternates ?? []).map((alternate) => `${alternate.base}${suffix}`);
  let interpretation: string | undefined;

  if (!primary.silent) {
    interpretation = primary.note !== undefined ? primary.note.replace("{heard}", heard) : `Showing ${primary.reading} for '${heard}'.`;
    if (primary.alternates && primary.alternates.length > 0) {
      interpretation += ` You can also view ${joinLabels(primary.alternates.map((a) => a.label))} below.`;
    }
  }

  return {
    correctedText,
    corrections,
    mapped: {
      canonicalQuestion: `${primary.base}${suffix}`,
      group: primary.id,
      ...(interpretation ? { interpretation } : {}),
      heard,
      fillerDropped,
      alternates,
    },
  };
}
