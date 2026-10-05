/** Layer 3 guard, the name-side companion to handlers/chat.ts's numeric cross-check: a name (2+ Capitalised tokens) must have all its words in ONE source string (row value, column, question, vocabulary), never scattered cells.
 * Deliberate simplification: lone capitalised words pass and an embellished real name is rejected (costs only the optional sentence); upgrade path: a domain alias list. */

// Batch 5A-1: "Co." is an abbreviation but "CO." (Colorado) ends a sentence ("... Castle Rock, CO. Other ..."); reading it as an abbreviation
// glued the next word on ("CO Other") and wrongly rejected 9 of 40 live summaries (2026-09-21).
const ABBREVIATION = { test: (token: string): boolean => /^(st|dr|mt|ft|inc|corp|ltd|jr|sr)\.$/i.test(token) || token === "Co." };

/** Batch 5A-2: a word joined by underscores ("avg_patient_satisfaction", "MORT_30_AMI") is a column/code dump, so the sentence is left out
 * (rows and note unaffected); no hospital, place or plain word contains one. */
export function mentionsIdentifier(summary: string): boolean {
  return /[A-Za-z0-9]+_[A-Za-z0-9_]+/.test(summary);
}

/** Words a sentence starts with that are capitalised only for that reason ("The Mayo Clinic ...") - never part of a name. */
const SENTENCE_OPENERS = new Set([
  "the", "a", "an", "among", "both", "all", "overall", "top", "best", "in", "at", "for", "with", "however", "also",
  "additionally", "notably", "each", "some", "most", "several", "here", "these", "those", "this", "that", "other",
  "another", "according", "based", "while", "although", "whereas", "together", "finally", "first", "second", "third",
  // Phase 3.5: openers of the executive summary's takeaway lines ("Across Ohio, ...", "Only 3 ...", "Every hospital ...").
  "across", "only", "every", "no", "none", "of", "on", "within", "compared", "nationally", "scores", "ratings", "results",
  "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "twenty",
]);

/** CMS stores a county as "COLQUITT", not "Colquitt County" (a Louisiana parish likewise): the suffix in a summary is not a word to find in the rows. */
const PLACE_SUFFIXES = new Set(["county", "parish", "borough"]);

/** Lower-cased alphanumeric words; apostrophes are dropped ("Mary's" -> "marys", as CMS writes MARYS). */
function words(text: string): string[] {
  return text.toLowerCase().replace(/['’]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
}

/** `vocabulary` is the caller's domain terms; "United States" is generic prose and always allowed. Returns unsupported names, empty when grounded. */
export function findUngroundedNames(
  summary: string,
  question: string,
  rows: readonly Record<string, unknown>[],
  vocabulary: readonly string[],
): string[] {
  const sources = [
    question,
    "United States",
    ...vocabulary,
    ...rows.flatMap((row) => [...Object.keys(row), ...Object.values(row).map(String)]),
  ];
  const cells = sources.map((source) => new Set(words(source)));
  // "Clinic's" -> "clinics" and "Hospitals" match a source's "clinic" / "hospital".
  const has = (cell: Set<string>, word: string) => cell.has(word) || (word.endsWith("s") && cell.has(word.slice(0, -1)));
  const grounded = (run: string[]) => {
    const needed = run.flatMap(words).filter((word) => !PLACE_SUFFIXES.has(word));
    return cells.some((cell) => needed.every((word) => has(cell, word)));
  };

  const ungrounded: string[] = [];
  let run: string[] = [];
  let runStartsSentence = false;
  let sentenceStart = true;

  const flush = () => {
    // "The Mayo Clinic" / "Among Cleveland Clinic": the opener is not part of the name.
    const name = runStartsSentence && SENTENCE_OPENERS.has(run[0]?.toLowerCase() ?? "") ? run.slice(1) : run;
    if (name.length >= 2 && !grounded(name)) {
      ungrounded.push(name.join(" "));
    }
    run = [];
  };

  for (const token of summary.split(/\s+/).filter(Boolean)) {
    // Phase 3.5: a bullet marker ("• ", "- ") starts a sentence, like a full stop does.
    if (/^[•\-*]$/.test(token)) {
      flush();
      sentenceStart = true;
      continue;
    }
    if (/^[("“‘[]/.test(token)) {
      flush();
    }
    const core = token.replace(/^[^A-Za-z0-9]+/, "").replace(/[^A-Za-z0-9]+$/, "");
    if (/^[A-Z]/.test(core)) {
      if (run.length === 0) {
        runStartsSentence = sentenceStart;
      }
      run.push(core);
      if (/[,;:.!?)\]”"]$/.test(token) && !ABBREVIATION.test(token)) {
        flush();
      }
    } else {
      flush();
    }
    sentenceStart = /[.!?]$/.test(token) && !ABBREVIATION.test(token);
  }
  flush();

  return ungrounded;
}
