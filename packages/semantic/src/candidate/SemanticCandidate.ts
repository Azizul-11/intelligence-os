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
  /**
   * Original phrase extracted from the query.
   */
  phrase: string;

  /**
   * Canonical registry key.
   */
  canonicalKey: string;

  /**
   * Semantic classification.
   */
  semanticType: SemanticType;

  /**
 * Full semantic definition loaded from the registry.
 */
definition: SemanticDefinition;

  /**
   * Confidence score.
   * 0.0 - 1.0
   */
  confidence: number;

  /**
   * Phrase start token index.
   */
  start: number;

  /**
   * Phrase end token index.
   */
  end: number;

  resolvedValue?: unknown;

  /**
   * Ranking direction implied by a nearby superlative modifier
   * ("highest", "lowest", ...), when one could be associated with this
   * candidate. Only meaningful for metric-typed candidates. Generic,
   * domain-agnostic — populated by ModifierDirectionResolver.
   */
  direction?: "asc" | "desc";

  /**
   * Batch 3 (D1): which kind of modifier word `direction` came from - a
   * "performance" word ("best", "worst": the word itself says which end is
   * good) or a "magnitude" word ("highest", "lowest": it names the number).
   * Generic, domain-agnostic - populated with `direction` by
   * ModifierDirectionResolver; the planner combines it with the metric's
   * `lowerIsBetter` to normalize the ExecutionPlan direction.
   */
  directionBasis?: "performance" | "magnitude";

  /**
   * True when this candidate's phrase was introduced by a domain's
   * declared generic-ranking-idiom rewrite rule (see
   * LexicalRewriteRule) rather than appearing verbatim in the user's
   * original text - i.e. it represents a fallback/default meaning
   * supplied in the absence of anything more specific, not an explicit
   * user request. Generic, domain-agnostic — populated by
   * SemanticPipeline from LexicalRewriter's applied-replacements record.
   * Only meaningful for metric-typed candidates.
   */
  isFallback?: boolean;

  /**
   * Batch 4: the text of the lexical rewrite rule(s) that introduced this
   * candidate's phrase (e.g. "hospital comes out on top" for the phrase
   * "hospital overall rating"). The rule itself is the domain's declaration
   * that it understands those words, so they count as accounted for. Generic,
   * domain-agnostic - populated by SemanticPipeline from LexicalRewriter's
   * applied-replacements record, read by QueryPlanner.
   */
  consumedText?: string;
}