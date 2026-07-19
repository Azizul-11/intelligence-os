import type { SemanticValidationContext } from "./validation-context";
import type { SemanticValidationResult } from "./validation-result";
import type { SemanticValidator } from "./validator";

export class CrossRegistryValidator implements SemanticValidator {
  validate(
    context: SemanticValidationContext,
  ): SemanticValidationResult {
    const errors: string[] = [];

    const registry = new Map<string, string>();

    this.register(context.entities.map(e => e.id), "Entity", registry, errors);
    this.register(context.concepts.map(c => c.id), "Concept", registry, errors);
    this.register(context.metrics.map(m => m.id), "Metric", registry, errors);
    this.register(context.categories.map(c => c.id), "Category", registry, errors);
    this.register(context.dimensions.map(d => d.id), "Dimension", registry, errors);
    this.register(context.benchmarks.map(b => b.id), "Benchmark", registry, errors);
    this.register(context.capabilities.map(c => c.id), "Capability", registry, errors);
    this.register(context.recommendations.map(r => r.id), "Recommendation", registry, errors);
    this.register(context.sqlTemplates.map(s => s.id), "SQL Template", registry, errors);

    return {
      valid: errors.length === 0,
      warnings: [],
      errors,
    };
  }

  private register(
    ids: readonly string[],
    type: string,
    registry: Map<string, string>,
    errors: string[],
  ): void {
    for (const id of ids) {
      const existing = registry.get(id);

      if (existing) {
        errors.push(
          `'${id}' exists in both ${existing} and ${type}.`,
        );
        continue;
      }

      registry.set(id, type);
    }
  }
}