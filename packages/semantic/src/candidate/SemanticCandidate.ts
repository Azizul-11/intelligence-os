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
}