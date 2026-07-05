import type { AliasDefinition } from "../alias-registry";
import type { BenchmarkDefinition } from "../benchmark-registry";
import type { CapabilityDefinition } from "../capability-registry";
import type { EntityDefinition } from "../entity-registry";
import type { MetricDefinition } from "../metric-registry";
import type { RecommendationDefinition } from "../recommendation-registry";
import type { RelationshipDefinition } from "../relationship-registry";
import type { SqlTemplateDefinition } from "../sql-template-registry";

import type { DomainManifest } from "./domain-manifest";

/**
 * Public contract implemented by every Domain Pack.
 *
 * The manifest describes the domain.
 * The registries provide the domain knowledge.
 */
export interface DomainPack {
  manifest: DomainManifest;

  entities: readonly EntityDefinition[];

  metrics: readonly MetricDefinition[];

  aliases: readonly AliasDefinition[];

  relationships: readonly RelationshipDefinition[];

  benchmarks: readonly BenchmarkDefinition[];

  sqlTemplates: readonly SqlTemplateDefinition[];

  capabilities: readonly CapabilityDefinition[];

  recommendations: readonly RecommendationDefinition[];
}