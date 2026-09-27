/**
 * Batch 1 (V4 fix plan): moved verbatim from `packages/runtime-engine/src/create-runtime-engine.ts` (2,000 sweep,
 * Batch E), so the unaccounted-word guard in `query-planner.ts` (`findUnaccountedWords`) and the engine's own limit
 * reader share one definition and can never disagree about which number a question asks for. Generic English, no
 * domain word.
 *
 * `ten: 10` is new here: before this move "top ten" read as no count at all (10 is `ExecutionPlanMapper`'s own
 * default, so the executed limit did not change), but the guard added in this batch needs the word registered to
 * recognize "ten" as the count it is about to exempt.
 */
export const COUNT = "(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)";
export const COUNT_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/**
 * How many results the question asks for ("top 5", "bottom 3", "the 3 worst"), read from the user's own words (a
 * rewrite drops the number). A star count ("top 5 star hospitals") is not a count, and "first" / "last" are left out
 * ("in the last 3 years").
 */
export function requestedCount(question: string): number | undefined {
  const text = question.toLowerCase().replace(/-/g, " ");
  const match =
    text.match(new RegExp(`\\b(?:top|bottom|best|worst|highest|lowest)\\s+${COUNT}\\b(?!\\s*stars?\\b)`)) ??
    text.match(new RegExp(`\\b${COUNT}\\s+(?:best|worst|top|bottom|highest|lowest|safest)\\b`));
  const count = match?.[1] ? (COUNT_WORDS[match[1]] ?? Number(match[1])) : undefined;

  return count !== undefined && count > 0 ? count : undefined;
}
