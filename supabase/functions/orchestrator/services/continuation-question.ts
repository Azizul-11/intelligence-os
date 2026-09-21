/**
 * Layer 2 continuation: the question a Turn 2 re-runs through the engine.
 *
 * Pure and dependency-free, so it is unit-tested under tsx
 * (scripts/verify-comparison-continuation.ts) as well as run in the Deno edge
 * function (services/continuation.ts). It lives apart from continuation.ts
 * because that file needs the database and the deployed runtime, and this
 * wording is the part that has regressed more than once.
 *
 * A clarification choice is re-run as the original question with the chosen
 * place appended: "Northwest Medical Center" -> "Northwest Medical Center in
 * Tucson, AZ". The identity itself is pinned by value in the request
 * (`forcedIdentityCandidate`), so the text only has to stay resolvable.
 *
 * Not for a comparison of hospitals (Turn 1 had a comparison word and another
 * named hospital, or the reply named both places). The place is appended to the
 * END of the question, so it lands on the LAST named hospital:
 * "compare memorial hospital vs CUERO REGIONAL HOSPITAL in CARTHAGE, IL". That
 * text contradicts the hospital (it is in Texas) and, after a name that ends in
 * "hospital", it spells the listing phrase "hospital in", which turns the
 * comparison into a list request the engine cannot serve. Both hospitals are
 * already pinned by value (the chosen one by `forcedIdentityCandidate`, the
 * other by `companionEntities`), so nothing needs re-resolving from text.
 *
 * A geographic choice (a state for a county) has no `state` field and keeps its
 * qualifier.
 */
export function continuationQuestion(
  originalQuestion: string,
  option: { city?: string; state?: string },
  context: { isComparison: boolean; twoSlot: boolean },
): string {
  const hospitalsPinnedByValue = context.twoSlot || (context.isComparison && Boolean(option.state));
  const place = hospitalsPinnedByValue ? "" : [option.city, option.state].filter(Boolean).join(", ");

  return place ? `${originalQuestion} in ${place}` : originalQuestion;
}
