import type { ClarificationOption } from "@intelligence/contracts";

/** Phase 8.10 Layer 2: deterministically match a reply to offered clarification options, in order: exact identity field (e.g. facility_id), case-insensitive location (city, state), unique partial display label.
 * NO fuzzy matching, similarity scoring or LLM; returns null if no unique match. */
export function matchClarificationResponse(
  userResponse: string,
  options: ClarificationOption[]
): ClarificationOption | null {
  if (!userResponse || options.length === 0) {
    return null;
  }

  const normalized = userResponse.toLowerCase().trim();

  // Try exact matches on common identity fields
  for (const option of options) {
    // Check if any field matches exactly
    for (const [key, value] of Object.entries(option)) {
      if (
        typeof value === "string" &&
        value.toLowerCase() === normalized
      ) {
        return option;
      }
    }
  }

  // Try location field matches (city, state) - case-insensitive
  const cityMatches = options.filter(
    (o) =>
      o.city &&
      typeof o.city === "string" &&
      o.city.toLowerCase() === normalized
  );
  if (cityMatches.length === 1) return cityMatches[0] || null;

  const stateMatches = options.filter(
    (o) =>
      o.state &&
      typeof o.state === "string" &&
      o.state.toLowerCase() === normalized
  );
  if (stateMatches.length === 1) return stateMatches[0] || null;

  // "CITY, ST": the shape the clarification's own labels use. City and state
  // must each equal the option's own field (exact, never a substring).
  const [cityPart, statePart, ...extraParts] = normalized.split(",").map((part) => part.trim());
  if (cityPart && statePart && extraParts.length === 0) {
    const cityStateMatches = options.filter(
      (o) =>
        typeof o.city === "string" &&
        typeof o.state === "string" &&
        o.city.toLowerCase() === cityPart &&
        o.state.toLowerCase() === statePart
    );
    if (cityStateMatches.length === 1) return cityStateMatches[0] || null;
  }

  // Try partial display label match (only if unique)
  const labelMatches = options.filter((o) => {
    const label =
      typeof o.displayLabel === "string" ? o.displayLabel.toLowerCase() : "";
    return label.includes(normalized) || normalized.includes(label);
  });
  if (labelMatches.length === 1) return labelMatches[0] || null;

  // No unique match found
  return null;
}

/** Batch 4: a reply filling both slots of a comparison ("ABILENE and GONZALES"); each side must match exactly one option by the rules above and the two must differ. Callers decide whether a pair applies. */
export function matchClarificationPair(
  userResponse: string,
  options: ClarificationOption[]
): [ClarificationOption, ClarificationOption] | null {
  const sides = (userResponse ?? "").split(/\s+(?:and|&)\s+/i);
  if (sides.length !== 2) return null;

  const first = matchClarificationResponse(sides[0]!, options);
  const second = matchClarificationResponse(sides[1]!, options);

  return first && second && first !== second ? [first, second] : null;
}
