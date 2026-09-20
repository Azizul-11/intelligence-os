/**
 * Layer 3 guard, the name-side companion to the numeric cross-check in
 * handlers/chat.ts. That check only proves every NUMBER in a summary occurs in
 * the rows; live (2026-09-19) both summaries shown named hospitals that were not
 * in the table (New England Medical Center, Mount Sinai, UPMC Pittsburgh,
 * AdventHealth Orlando) and passed it.
 *
 * A "name" here is a run of two or more consecutive Capitalised tokens
 * ("Mayo Clinic", "Pittsburgh Medical Center"). It is grounded when all of its
 * words occur together in ONE source string - a row value, a column name, the
 * user's question, or the caller's own vocabulary (state names, metric names).
 * One string, not the whole pool, so a name cannot be assembled from words
 * scattered across unrelated cells.
 *
 * Deliberate simplifications (the ceiling, and why it errs safe): single
 * capitalised words are not checked (a lone invented "Stanford" passes); an
 * embellished real name ("Cleveland Clinic Foundation" for "CLEVELAND CLINIC")
 * is rejected. A wrongly rejected summary only costs the optional sentence -
 * the rows are untouched. Upgrade path if it rejects too much: a domain-supplied
 * alias list.
 */

const ABBREVIATION = /^(st|dr|mt|ft|inc|corp|ltd|co|jr|sr)\.$/i;

/** Words a sentence starts with that are capitalised only for that reason ("The Mayo Clinic ...") - never part of a name. */
const SENTENCE_OPENERS = new Set([
  "the", "a", "an", "among", "both", "all", "overall", "top", "best", "in", "at", "for", "with", "however", "also",
  "additionally", "notably", "each", "some", "most", "several", "here", "these", "those", "this", "that", "other",
  "another", "according", "based", "while", "although", "whereas", "together", "finally", "first", "second", "third",
]);

/** CMS stores a county as "COLQUITT", not "Colquitt County" (a Louisiana parish likewise): the suffix in a summary is not a word to find in the rows. */
const PLACE_SUFFIXES = new Set(["county", "parish", "borough"]);

/** Lower-cased alphanumeric words; apostrophes are dropped ("Mary's" -> "marys", as CMS writes MARYS). */
function words(text: string): string[] {
  return text.toLowerCase().replace(/['’]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * `vocabulary` is the caller's own domain terms (state, metric, condition names);
 * "United States" is generic prose ("...in the United States") and always allowed.
 * Returns the unsupported names, empty when the summary is grounded.
 */
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
