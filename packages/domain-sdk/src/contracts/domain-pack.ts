/** Everything a Domain Pack registers: entities, metrics, aliases, templates, and its execution strategy/entity provider. */
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

  /** Optional text-rewrite rules for a generic ranking idiom (e.g. "best <entities>") implying a default metric. */
  lexicalRewrites?: readonly LexicalRewriteRule[];

  /** V4 Batch 4: entity parameter names that must survive an LLM rewrite unchanged - restored from the user's own words if dropped. */
  preservedEntityParameters?: readonly string[];

  executionStrategy: DomainExecutionStrategy;
  
  entityProvider: EntityProvider;
}