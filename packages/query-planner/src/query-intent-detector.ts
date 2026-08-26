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