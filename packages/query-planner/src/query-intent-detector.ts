import type { QueryIntent } from "./query-intent";

export class QueryIntentDetector {
  detect(question: string): QueryIntent {
    const q = question.toLowerCase();

    if (
      q.includes("highest") ||
      q.includes("lowest") ||
      q.includes("best") ||
      q.includes("worst") ||
      q.includes("top") ||
      q.includes("bottom") ||
      q.includes("better")
    ) {
      return "ranking";
    }

    if (
      q.includes("compare") ||
      q.includes("vs") ||
      q.includes("versus")
    ) {
      return "comparison";
    }

    if (
      q.includes("trend") ||
      q.includes("over time")
    ) {
      return "trend";
    }

    if (
      q.includes("average") ||
      q.includes("count") ||
      q.includes("total") ||
      q.includes("how many")
    ) {
      return "aggregation";
    }

    return "lookup";
  }
}