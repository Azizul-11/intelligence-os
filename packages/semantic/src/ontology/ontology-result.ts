// import type { SemanticType } from "@intelligence/domain-sdk";

// export interface OntologyResult {
//   found: boolean;

//   canonicalKey: string | null;

//   semanticType: SemanticType | null;
// }


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

export interface OntologyResult {
  found: boolean;

  canonicalKey: string | null;

  semanticType: SemanticType | null;

  definition?:
    | MetricDefinition
    | EntityDefinition
    | ConceptDefinition
    | CategoryDefinition
    | RelationshipDefinition
    | DimensionDefinition
    | BenchmarkDefinition;
}