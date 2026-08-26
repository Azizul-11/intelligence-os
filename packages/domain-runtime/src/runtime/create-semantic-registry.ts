import type { DomainPack } from "@intelligence/domain-sdk";
// import {
//   SemanticRegistryBuilder,
//   type SemanticRegistry,
// } from "@intelligence/semantic";

import {
  Normalizer,
  SemanticRegistryBuilder,
  type SemanticRegistry,
} from "@intelligence/semantic";

export function createSemanticRegistry(
  domain: DomainPack,
): SemanticRegistry {
  const builder = new SemanticRegistryBuilder();
  const normalizer = new Normalizer();
  
  // Metrics
for (const metric of domain.metrics) {
  builder.addMetric(metric);
}

// Entities
for (const entity of domain.entities) {
  builder.addEntity(entity);
}

// Concepts
for (const concept of domain.concepts) {
  builder.addConcept(concept);
}

// Categories
for (const category of domain.categories) {
  builder.addCategory(category);
}

// Dimensions
for (const dimension of domain.dimensions) {
  builder.addDimension(dimension);
}

// Relationships
for (const relationship of domain.relationships) {
  builder.addRelationship(relationship);
}

// Benchmarks
for (const benchmark of domain.benchmarks) {
  builder.addBenchmark(benchmark);
}

  // Lexical rewrite rules (generic ranking-idiom fallback declarations)
  for (const rule of domain.lexicalRewrites ?? []) {
    builder.addLexicalRewrite(rule);
  }

  // Aliases
  for (const aliasDefinition of domain.aliases) {
    for (const alias of aliasDefinition.aliases) {
      // builder.addAlias(alias, aliasDefinition.canonical);
      builder.addAlias(
  normalizer.normalize(alias),
  aliasDefinition.canonical,
);
    }
  }

  // return builder.build();
  const registry = builder.build();

console.log("========== REGISTRY DEBUG ==========");
console.log("Aliases:", registry.getAliases());
console.log("====================================");

return registry;
}