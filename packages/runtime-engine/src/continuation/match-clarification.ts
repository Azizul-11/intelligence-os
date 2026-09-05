import type { ClarificationOption } from "@intelligence/contracts";

/**
 * Phase 8.10 Layer 2: Deterministically match user response against offered
 * clarification options.
 * 
 * Matching logic (in priority order):
 * 1. Exact match on any identity field (e.g., facility_id)
 * 2. Case-insensitive match on location fields (city, state)
 * 3. Partial match on display label (only if unique)
 * 
 * NO fuzzy matching, NO similarity scoring, NO LLM.
 * 
 * @param userResponse User's continuation response
 * @param options Offered clarification options from pending interaction
 * @returns Matched option, or null if no unique match found
 */
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
