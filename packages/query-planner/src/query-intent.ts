/** The fixed set of query intents QueryIntentDetector can classify a question into. */
export type QueryIntent =
  | "lookup"
  | "ranking"
  | "comparison"
  | "trend"
  | "aggregation";