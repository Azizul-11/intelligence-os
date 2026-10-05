import type {
  BenchmarkDefinition,
  CategoryDefinition,
  ConceptDefinition,
  DimensionDefinition,
  EntityDefinition,
  MetricDefinition,
  RelationshipDefinition,
  SemanticType,
} from "@intelligence/domain-sdk";


export type SemanticDefinition =
  | MetricDefinition
  | EntityDefinition
  | ConceptDefinition
  | CategoryDefinition
  | RelationshipDefinition
  | DimensionDefinition
  | BenchmarkDefinition;



export interface SemanticCandidate {
  /** Original phrase extracted from the query. */
  phrase: string;

  /** Canonical registry key. */
  canonicalKey: string;

  /** Semantic classification. */
  semanticType: SemanticType;

  /** Full semantic definition loaded from the registry. */
definition: SemanticDefinition;

  /** Confidence score, 0.0 - 1.0. */
  confidence: number;

  /** Phrase start token index. */
  start: number;

  /** Phrase end token index. */
  end: number;

  resolvedValue?: unknown;

  /** Ranking direction from a nearby superlative modifier; metric-typed candidates only, set by ModifierDirectionResolver. */
  direction?: "asc" | "desc";

  /** Batch 3 (D1): whether `direction` came from a "performance" word (best/worst) or a "magnitude" word (highest/lowest); the planner combines it with `lowerIsBetter`. */
  directionBasis?: "performance" | "magnitude";

  /** True when the phrase came from a domain generic-ranking-idiom rewrite rule, not the user's text (a default meaning); metric-typed only, set by SemanticPipeline. */
  isFallback?: boolean;

  /** Batch 4: text of the rewrite rule(s) that introduced this phrase; counts as accounted-for wording, read by QueryPlanner. */
  consumedText?: string;
}