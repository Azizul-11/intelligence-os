export interface SemanticValidationResult {
  valid: boolean;

  warnings: string[];

  errors: string[];
}

export function validateSemanticRegistry(input: {
  entities: readonly { key: string }[];

  metrics: readonly { key: string }[];

  categories: readonly { key: string }[];

  dimensions: readonly { key: string }[];

  aliases: readonly { alias: string }[];

  benchmarks: readonly { key: string }[];

  relationships: readonly { source: string; target: string }[];
}): SemanticValidationResult {
  const warnings: string[] = [];

  const errors: string[] = [];

  function checkDuplicates(
    values: readonly string[],
    label: string,
  ) {
    const seen = new Set<string>();

    for (const value of values) {
      if (seen.has(value)) {
        errors.push(`${label} "${value}" is duplicated.`);
      }

      seen.add(value);
    }
  }

  checkDuplicates(
    input.entities.map((x) => x.key),
    "Entity",
  );

  checkDuplicates(
    input.metrics.map((x) => x.key),
    "Metric",
  );

  checkDuplicates(
    input.categories.map((x) => x.key),
    "Category",
  );

  checkDuplicates(
    input.dimensions.map((x) => x.key),
    "Dimension",
  );

  checkDuplicates(
    input.aliases.map((x) => x.alias.toLowerCase()),
    "Alias",
  );

  checkDuplicates(
    input.benchmarks.map((x) => x.key),
    "Benchmark",
  );

  return {
    valid: errors.length === 0,

    warnings,

    errors,
  };
}