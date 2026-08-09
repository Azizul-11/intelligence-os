// src/runtime/create-semantic-registry.ts
import {
  Normalizer,
  SemanticRegistryBuilder
} from "@intelligence/semantic";
function createSemanticRegistry(domain) {
  const builder = new SemanticRegistryBuilder();
  const normalizer = new Normalizer();
  for (const metric of domain.metrics) {
    builder.addMetric(metric);
  }
  for (const entity of domain.entities) {
    builder.addEntity(entity);
  }
  for (const concept of domain.concepts) {
    builder.addConcept(concept);
  }
  for (const category of domain.categories) {
    builder.addCategory(category);
  }
  for (const dimension of domain.dimensions) {
    builder.addDimension(dimension);
  }
  for (const relationship of domain.relationships) {
    builder.addRelationship(relationship);
  }
  for (const benchmark of domain.benchmarks) {
    builder.addBenchmark(benchmark);
  }
  for (const aliasDefinition of domain.aliases) {
    for (const alias of aliasDefinition.aliases) {
      builder.addAlias(
        normalizer.normalize(alias),
        aliasDefinition.canonical
      );
    }
  }
  const registry = builder.build();
  console.log("========== REGISTRY DEBUG ==========");
  console.log("Aliases:", registry.getAliases());
  console.log("====================================");
  return registry;
}

// src/runtime/create-domain-runtime.ts
import { SqlTemplateResolver } from "@intelligence/sql-template-resolver";
function createDomainRuntime(domain) {
  return {
    domain,
    registry: createSemanticRegistry(domain),
    sqlResolver: new SqlTemplateResolver(
      domain.sqlTemplates
    ),
    entityProvider: domain.entityProvider
  };
}
export {
  createDomainRuntime,
  createSemanticRegistry
};
