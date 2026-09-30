/** Shared with the unaccounted-word guard in query-planner.ts, so both read the same number from a question. */
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

/** How many results the question asks for ("top 5", "the 3 worst"). A star count ("5 star hospitals") isn't a count. */
export function requestedCount(question: string): number | undefined {
  const text = question.toLowerCase().replace(/-/g, " ");
  const match =
    text.match(new RegExp(`\\b(?:top|bottom|best|worst|highest|lowest)\\s+${COUNT}\\b(?!\\s*stars?\\b)`)) ??
    text.match(new RegExp(`\\b${COUNT}\\s+(?:best|worst|top|bottom|highest|lowest|safest)\\b`));
  const count = match?.[1] ? (COUNT_WORDS[match[1]] ?? Number(match[1])) : undefined;

  return count !== undefined && count > 0 ? count : undefined;
}
