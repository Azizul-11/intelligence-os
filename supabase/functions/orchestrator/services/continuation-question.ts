/** Layer 2 continuation: the question a Turn 2 re-runs through the engine; pure so tsx tests (scripts/verify-comparison-continuation.ts) and Deno share it. A chosen place is appended ("... in Tucson, AZ")
 * except for hospital comparisons, where it lands on the LAST hospital and breaks the question (both hospitals are pinned by `forcedIdentityCandidate`/`companionEntities`). */
export function continuationQuestion(
  originalQuestion: string,
  option: { city?: string; state?: string },
  context: { isComparison: boolean; twoSlot: boolean },
): string {
  const hospitalsPinnedByValue = context.twoSlot || (context.isComparison && Boolean(option.state));
  const place = hospitalsPinnedByValue ? "" : [option.city, option.state].filter(Boolean).join(", ");

  return place ? `${originalQuestion} in ${place}` : originalQuestion;
}
