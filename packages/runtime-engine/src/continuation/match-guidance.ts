import type { GuidanceOption } from "@intelligence/contracts";

/**
 * Phase 8.10 Layer 2: Deterministically match user response against offered
 * guidance options (alternative capabilities).
 * 
 * Matching logic (in priority order):
 * 1. Exact capability ID match
 * 2. Exact display name match (case-insensitive)
 * 3. Partial display name match (only if unique)
 * 
 * Common prefixes like "use", "try", "with", "show" are stripped.
 * 
 * NO fuzzy matching, NO similarity scoring, NO LLM, NO searching entire metric
 * registry - ONLY match against offered options.
 * 
 * @param userResponse User's continuation response
 * @param options Offered guidance options from pending interaction
 * @returns Matched option, or null if no unique match found
 */
export function matchGuidanceResponse(
  userResponse: string,
  options: GuidanceOption[]
): GuidanceOption | null {
  if (!userResponse || options.length === 0) {
    return null;
  }

  // Normalize and strip common prefixes
  let normalized = userResponse.toLowerCase().trim();
  normalized = normalized.replace(/^(use|try|show|with)\s+/i, "");

  // 1. Exact capability ID match
  const exactId = options.find((o) => o.capabilityId === normalized);
  if (exactId) return exactId;

  // 2. Exact display name match (case-insensitive)
  const exactName = options.find(
    (o) => o.displayName.toLowerCase() === normalized
  );
  if (exactName) return exactName;

  // 3. Partial display name match (only if unique)
  const partialMatches = options.filter((o) => {
    const displayName = o.displayName.toLowerCase();
    return (
      displayName.includes(normalized) || normalized.includes(displayName)
    );
  });
  if (partialMatches.length === 1) return partialMatches[0] || null;

  // No unique match found
  return null;
}
