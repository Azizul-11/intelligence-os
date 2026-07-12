import type { DomainPack } from "@intelligence/domain-sdk";

import { healthcareManifest } from "./metadata";

import { healthcareEntities } from "./entities";
import { healthcareMetrics } from "./metrics";
import { healthcareAliases } from "./aliases";
import { healthcareRelationships } from "./relationships";
import { healthcareBenchmarks } from "./benchmarks";
import { healthcareSqlTemplates } from "./sql";
import { healthcareCapabilities } from "./capabilities";
import { healthcareRecommendations } from "./recommendations";

import { healthcareCategories } from "./categories";
import { healthcareDimensions } from "./dimensions";

export const healthcareDomain: DomainPack = {
  manifest: healthcareManifest,


  entities: healthcareEntities,

  metrics: healthcareMetrics,

  aliases: healthcareAliases,

  dimensions: healthcareDimensions,

categories: healthcareCategories,


  relationships: healthcareRelationships,

  benchmarks: healthcareBenchmarks,

  sqlTemplates: healthcareSqlTemplates,

  capabilities: healthcareCapabilities,

  recommendations: healthcareRecommendations,
};