import { healthcareDomain } from "../../domain-packs/healthcare/src";

import { loadEntities } from "./loaders/entity-loader";
import { loadMetrics } from "./loaders/metric-loader";
import { loadCategories } from "./loaders/category-loader";
import { loadDimensions } from "./loaders/dimension-loader";
import { loadAliases } from "./loaders/alias-loader";
import { loadBenchmarks } from "./loaders/benchmark-loader";
import { loadRelationships } from "./loaders/relationship-loader";

import { insertEntities } from "./warehouse/insert-entities";
import { insertMetrics } from "./warehouse/insert-metrics";
import { insertCategories } from "./warehouse/insert-categories";
import { insertDimensions } from "./warehouse/insert-dimensions";
import { insertAliases } from "./warehouse/insert-aliases";
import { insertBenchmarks } from "./warehouse/insert-benchmarks";
import { insertRelationships } from "./warehouse/insert-relationships";

import { validateSemanticRegistry } from "./validate";
import { createSemanticReport } from "./report";

async function main() {
  console.log("========================================");
  console.log("Loading Semantic Registry...");
  console.log("========================================");

  const domain = healthcareDomain.manifest.metadata.id;

  //
  // Load
  //

  const entities = loadEntities(
    healthcareDomain.entities,
    domain,
  );

  const metrics = loadMetrics(
    healthcareDomain.metrics,
    domain,
  );

  const categories = loadCategories(
    healthcareDomain.categories,
    domain,
  );

  const dimensions = loadDimensions(
    healthcareDomain.dimensions,
    domain,
  );

  const aliases = loadAliases(
    healthcareDomain.aliases,
    domain,
  );

  const benchmarks = loadBenchmarks(
    healthcareDomain.benchmarks,
    domain,
  );

  const relationships = loadRelationships(
    healthcareDomain.relationships,
    domain,
  );

  //
  // Validate
  //

  const validation = validateSemanticRegistry({
    entities,
    metrics,
    categories,
    dimensions,
    aliases,
    benchmarks,
    relationships,
  });

  if (!validation.valid) {
    console.error(validation.errors);

    throw new Error("Semantic validation failed.");
  }

  //
  // Insert
  //

  await insertEntities(entities);

  await insertMetrics(metrics);

  await insertCategories(categories);

  await insertDimensions(dimensions);

  await insertAliases(aliases);

  await insertBenchmarks(benchmarks);

  await insertRelationships(relationships);

  //
  // Report
  //

  const report = createSemanticReport(
    {
      entities,
      metrics,
      categories,
      dimensions,
      aliases,
      benchmarks,
      relationships,
    },
    validation,
  );

  console.log("");
  console.log("Semantic Registry Loaded Successfully");
  console.table(report);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});