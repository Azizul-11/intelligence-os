// src/query-intent-detector.ts
var QueryIntentDetector = class {
  detect(question) {
    const q = question.toLowerCase();
    if (q.includes("highest") || q.includes("lowest") || q.includes("best") || q.includes("worst") || q.includes("top") || q.includes("bottom")) {
      return "ranking";
    }
    if (q.includes("compare") || q.includes("vs") || q.includes("versus")) {
      return "comparison";
    }
    if (q.includes("trend") || q.includes("over time")) {
      return "trend";
    }
    if (q.includes("average") || q.includes("count") || q.includes("total") || q.includes("how many")) {
      return "aggregation";
    }
    return "lookup";
  }
};

// src/semantic-collector.ts
var SemanticCollector = class {
  collect(matches) {
    return {
      metrics: matches.filter(
        (match) => match.semanticType === "metric"
      ),
      entities: matches.filter(
        (match) => match.semanticType === "entity"
      ),
      dimensions: matches.filter(
        (match) => match.semanticType === "dimension"
      ),
      categories: matches.filter(
        (match) => match.semanticType === "category"
      ),
      benchmarks: matches.filter(
        (match) => match.semanticType === "benchmark"
      ),
      relationships: matches.filter(
        (match) => match.semanticType === "relationship"
      )
    };
  }
};

// src/entity-parameter-resolver.ts
var EntityParameterResolver = class {
  resolve(semantic) {
    const parameters = {};
    for (const entity of semantic.entities) {
      const definition = entity.definition;
      const execution = definition.execution;
      if (!execution) {
        continue;
      }
      parameters[execution.parameter] = entity.resolvedValue ?? entity.phrase;
    }
    return parameters;
  }
};

// src/query-planner.ts
var QueryPlanner = class {
  intentDetector = new QueryIntentDetector();
  collector = new SemanticCollector();
  entityParameterResolver = new EntityParameterResolver();
  createPlan(semantic) {
    const collections = this.collector.collect(
      semantic.matches
    );
    if (!semantic.resolved || collections.metrics.length === 0) {
      return {
        success: false,
        plan: null
      };
    }
    const intent = this.intentDetector.detect(
      semantic.originalQuery
    );
    const parameters = this.entityParameterResolver.resolve(
      collections
    );
    console.log("========== QUERY PLANNER ==========");
    console.log("Semantic Collections");
    console.log({
      metrics: collections.metrics,
      entities: collections.entities,
      dimensions: collections.dimensions,
      categories: collections.categories,
      benchmarks: collections.benchmarks,
      relationships: collections.relationships
    });
    console.log("Intent :", intent);
    return {
      success: true,
      plan: {
        semantic: collections,
        intent,
        parameters,
        filters: []
      }
    };
  }
};
export {
  QueryIntentDetector,
  QueryPlanner,
  SemanticCollector
};
