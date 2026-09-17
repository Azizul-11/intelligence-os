import type { QueryIntent } from "./query-intent";
import { Normalizer } from "@intelligence/semantic";

/**
 * Exact-word keyword sets. Matched against normalized, whitespace-split
 * tokens (via the existing Universal Normalizer) rather than raw
 * substring search, so a word that merely CONTAINS a keyword - e.g.
 * "county" containing "count" - never spuriously matches.
 */
const RANKING_KEYWORDS = new Set([
  "highest",
  "lowest",
  "best",
  "worst",
  "top",
  "bottom",
  "better",
  "largest",
  "smallest",
  "greatest",
  "least",
  "ranked",
  "rank",
  "order",
  // Bug G (Phase 3.3, 2026-09-18): "strongest" is a plain English
  // superlative, exactly like every other word already in this set -
  // its absence meant a query also containing "compare"/"vs" (which
  // succeeds deterministically via COMPARISON_KEYWORDS on the very
  // first pass) never got a chance to fall through to Layer 1's LLM
  // rewrite (which does normalize "strongest" -> "best"), silently
  // returning an unranked result instead. The Round 6 audit's own fix
  // plan also suggested "strong" - deliberately NOT added here: a
  // direct grep of hospital-identity-directory.ts found a real,
  // confirmed collision ("STRONG MEMORIAL HOSPITAL"), the exact same
  // class of regression already documented for "good"/"great" and real
  // hospital names - adding it would flip `operation` to "rank" for any
  // query naming that hospital. "strongest" itself has zero matches.
  "strongest",
]);

const COMPARISON_KEYWORDS = new Set(["compare", "vs", "versus"]);

const TREND_KEYWORDS = new Set(["trend"]);

const AGGREGATION_KEYWORDS = new Set(["average", "count", "total"]);

export class QueryIntentDetector {
  private readonly normalizer = new Normalizer();

  detect(question: string): QueryIntent {
    const normalized = this.normalizer.normalize(question);
    const tokens = new Set(normalized.split(" ").filter(Boolean));

    if (this.hasAnyToken(tokens, RANKING_KEYWORDS)) {
      return "ranking";
    }

    if (this.hasAnyToken(tokens, COMPARISON_KEYWORDS)) {
      return "comparison";
    }

    if (this.hasAnyToken(tokens, TREND_KEYWORDS) || normalized.includes("over time")) {
      return "trend";
    }

    if (
      this.hasAnyToken(tokens, AGGREGATION_KEYWORDS) ||
      normalized.includes("how many") ||
      normalized.includes("number of")
    ) {
      return "aggregation";
    }

    return "lookup";
  }

  private hasAnyToken(
    tokens: ReadonlySet<string>,
    keywords: ReadonlySet<string>,
  ): boolean {
    for (const keyword of keywords) {
      if (tokens.has(keyword)) {
        return true;
      }
    }

    return false;
  }
}