import type { AliasDefinition } from "../alias-registry";
import type { BenchmarkDefinition } from "../benchmark-registry";
import type { CapabilityDefinition } from "../capability-registry";
import type { CategoryDefinition } from "../category-registry";
import type { DimensionDefinition } from "../dimension-registry";
import type { EntityDefinition } from "../entity-registry";
import type { MetricDefinition } from "../metric-registry";
import type { RecommendationDefinition } from "../recommendation-registry";
import type { RelationshipDefinition } from "../relationship-registry";
import type { SqlTemplateDefinition } from "../sql-template-registry";

import type { DomainManifest } from "./domain-manifest";

import type { ConceptDefinition } from "../concept-registry";

import type { DomainExecutionStrategy, EntityProvider } from "../runtime";

import type { LexicalRewriteRule } from "../lexical-rewrite-registry";

export interface DomainPack {
  manifest: DomainManifest;

  entities: readonly EntityDefinition[];

  concepts: readonly ConceptDefinition[];

  metrics: readonly MetricDefinition[];

  aliases: readonly AliasDefinition[];

  dimensions: readonly DimensionDefinition[];

  categories: readonly CategoryDefinition[];

  relationships: readonly RelationshipDefinition[];

  benchmarks: readonly BenchmarkDefinition[];

  sqlTemplates: readonly SqlTemplateDefinition[];

  capabilities: readonly CapabilityDefinition[];

  recommendations: readonly RecommendationDefinition[];

  /**
   * Optional, domain-declared text-rewrite rules for a generic ranking
   * idiom (e.g. "best <entities>") that implies a fallback/default
   * metric before phrase extraction runs. Universal Core executes these
   * generically; it never inspects their content. A domain with no such
   * idiom may omit this entirely.
   */
  lexicalRewrites?: readonly LexicalRewriteRule[];

  executionStrategy: DomainExecutionStrategy;
  
  entityProvider: EntityProvider;
}