import type { MatchResult } from "./match-result";

export class Matcher {
  match(candidates: readonly string[]): MatchResult {
    const canonicalKey = candidates.at(0);

    if (!canonicalKey) {
      return {
        matched: false,
        canonicalKey: null,
      };
    }

    return {
      matched: true,
      canonicalKey,
    };
  }
}