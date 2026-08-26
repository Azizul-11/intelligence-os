// export interface SemanticRegistryData {
//   readonly aliases: ReadonlyMap<string, string>;

//   readonly metrics: ReadonlySet<string>;

//   readonly entities: ReadonlySet<string>;

//   readonly concepts: ReadonlySet<string>;
  
//   readonly categories: ReadonlySet<string>;

//   readonly relationships: ReadonlySet<string>;
//   readonly dimensions: ReadonlySet<string>;
//   readonly benchmarks: ReadonlySet<string>;


// }


import type {
  BenchmarkDefinition,
  CategoryDefinition,
  ConceptDefinition,
  DimensionDefinition,
  EntityDefinition,
  LexicalRewriteRule,
  MetricDefinition,
  RelationshipDefinition,
} from "@intelligence/domain-sdk";


export interface SemanticRegistryData {
  readonly aliases: ReadonlyMap<string, string>;

  readonly lexicalRewrites: readonly LexicalRewriteRule[];

  readonly metrics:
    ReadonlyMap<string, MetricDefinition>;

  readonly entities:
    ReadonlyMap<string, EntityDefinition>;

  readonly concepts:
    ReadonlyMap<string, ConceptDefinition>;

  readonly categories:
    ReadonlyMap<string, CategoryDefinition>;

  readonly relationships:
    ReadonlyMap<string, RelationshipDefinition>;

  readonly dimensions:
    ReadonlyMap<string, DimensionDefinition>;

  readonly benchmarks:
    ReadonlyMap<string, BenchmarkDefinition>;
}