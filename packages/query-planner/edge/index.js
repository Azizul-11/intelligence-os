// src/query-intent-detector.ts
var QueryIntentDetector = class {
  detect(question) {
    const q = question.toLowerCase();
    if (q.includes("highest") || q.includes("lowest") || q.includes("best") || q.includes("worst") || q.includes("top") || q.includes("bottom") || q.includes("better")) {
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
    const finalCollections = {
      ...collections,
      metrics: this.filterMetricsForIntent(collections.metrics, intent)
    };
    const parameters = this.entityParameterResolver.resolve(
      finalCollections
    );
    console.log("========== QUERY PLANNER ==========");
    console.log("Semantic Collections");
    console.log({
      metrics: finalCollections.metrics,
      entities: finalCollections.entities,
      dimensions: finalCollections.dimensions,
      categories: finalCollections.categories,
      benchmarks: finalCollections.benchmarks,
      relationships: finalCollections.relationships
    });
    console.log("Intent :", intent);
    return {
      success: true,
      plan: {
        semantic: finalCollections,
        intent,
        parameters,
        filters: []
      }
    };
  }
  /**
   * Excludes metric candidates whose own definition declares them
   * non-rankable, when the query's detected intent is "ranking" AND at
   * least one OTHER candidate in the same query IS rankable.
   *
   * This resolves a class of alias collisions where a generic,
   * non-rankable metric phrase (e.g. one that also matches ordinary
   * connective language describing an entity, such as "<things> in
   * <place>") coincidentally overlaps with the start of a sentence that
   * is actually asking to rank other, genuinely rankable metrics.
   *
   * Deliberately conservative: never produces an empty metrics list,
   * and never touches a query where every candidate already agrees
   * (all rankable, or all non-rankable) - a standalone query for a
   * non-rankable metric is completely unaffected.
   */
  filterMetricsForIntent(metrics, intent) {
    if (intent !== "ranking") {
      return metrics;
    }
    const rankable = metrics.filter(
      (metric) => metric.definition.rankable === true
    );
    if (rankable.length === 0 || rankable.length === metrics.length) {
      return metrics;
    }
    return rankable;
  }
};

// src/execution-plan-mapper.ts
var ExecutionPlanMapper = class {
  /**
   * Map QueryPlan to ExecutionPlan.
   *
   * Converts semantic collections and intent into execution structure.
   */
  map(queryPlan) {
    const primaryMetric = this.extractPrimaryMetric(queryPlan);
    const operation = this.mapIntent(queryPlan.intent);
    const filters = this.buildFilters(queryPlan);
    const grouping = this.buildGrouping(queryPlan);
    const metrics = this.buildMetrics(queryPlan);
    const isMultiMetric = metrics.length > 1;
    const ordering = isMultiMetric ? void 0 : this.buildOrdering(queryPlan, operation);
    const limit = this.buildLimit(queryPlan);
    const plan = {
      operation,
      metric: primaryMetric,
      filters,
      parameters: queryPlan.parameters
    };
    if (isMultiMetric) {
      plan.metrics = metrics;
    }
    if (grouping !== void 0) {
      plan.grouping = grouping;
    }
    if (ordering !== void 0) {
      plan.ordering = ordering;
    }
    if (limit !== void 0) {
      plan.limit = limit;
    }
    return plan;
  }
  /**
   * Extract primary metric from semantic collections.
   */
  extractPrimaryMetric(queryPlan) {
    if (queryPlan.semantic.metrics.length === 0) {
      throw new Error("ExecutionPlan requires at least one metric");
    }
    const primaryMetric = queryPlan.semantic.metrics[0];
    if (!primaryMetric) {
      throw new Error("ExecutionPlan requires at least one metric");
    }
    return primaryMetric.canonicalKey;
  }
  /**
   * Build the distinct set of metrics carried by this plan, in original
   * semantic order, each paired with its independent ranking direction.
   *
   * Deduplicates by canonicalKey - exhaustive phrase extraction can
   * surface the same canonical metric via more than one matched phrase
   * (e.g. "hospital overall rating" and "overall rating" both matching
   * the same metric), and each distinct metric must appear only once.
   *
   * Direction comes from the semantic layer's modifier-association
   * signal (SemanticCandidate.direction, Phase 6.2). A distinct metric
   * with no associable modifier defaults to "desc", consistent with the
   * existing single-metric default in buildOrdering() below.
   */
  buildMetrics(queryPlan) {
    const seen = /* @__PURE__ */ new Set();
    const metrics = [];
    for (const candidate of queryPlan.semantic.metrics) {
      if (seen.has(candidate.canonicalKey)) {
        continue;
      }
      seen.add(candidate.canonicalKey);
      metrics.push({
        metric: candidate.canonicalKey,
        direction: candidate.direction ?? "desc"
      });
    }
    return metrics;
  }
  /**
   * Map QueryIntent to ExecutionOperation.
   */
  mapIntent(intent) {
    const mapping = {
      lookup: "lookup",
      ranking: "rank",
      comparison: "compare",
      trend: "analyze",
      aggregation: "aggregate"
    };
    return mapping[intent];
  }
  /**
   * Build execution filters from entity parameters.
   *
   * Converts resolved entities into filter constraints.
   */
  buildFilters(queryPlan) {
    const filters = [];
    for (const entity of queryPlan.semantic.entities) {
      const definition = entity.definition;
      if (!definition.execution) {
        continue;
      }
      const parameterName = definition.execution.parameter;
      const resolvedValue = entity.resolvedValue ?? entity.phrase;
      filters.push({
        field: parameterName,
        operator: "=",
        value: resolvedValue
      });
    }
    return filters;
  }
  /**
   * Build grouping from semantic dimensions.
   */
  buildGrouping(queryPlan) {
    if (queryPlan.semantic.dimensions.length === 0) {
      return void 0;
    }
    return {
      dimensions: queryPlan.semantic.dimensions.map((d) => d.canonicalKey)
    };
  }
  /**
   * Build ordering based on operation and metrics.
   *
   * Ranking operations order by primary metric descending.
   * Other operations may not require ordering.
   */
  buildOrdering(queryPlan, operation) {
    if (operation === "rank") {
      const primaryMetric = queryPlan.semantic.metrics[0]?.canonicalKey;
      if (!primaryMetric) {
        return void 0;
      }
      const hasAbove = queryPlan.semantic.relationships.some(
        (r) => r.canonicalKey === "above-comparison"
      );
      const hasBelow = queryPlan.semantic.relationships.some(
        (r) => r.canonicalKey === "below-comparison"
      );
      let direction = "desc";
      if (hasBelow) {
        direction = "asc";
      }
      return {
        field: primaryMetric,
        direction
      };
    }
    return void 0;
  }
  /**
   * Build execution limit.
   *
   * Apply default limit for operations that typically need them.
   */
  buildLimit(queryPlan) {
    if (queryPlan.intent === "ranking" || queryPlan.intent === "lookup") {
      return {
        value: 10,
        // Default limit
        offset: 0
      };
    }
    if (queryPlan.intent === "aggregation") {
      if (queryPlan.semantic.dimensions.length > 0) {
        return {
          value: 100,
          // Higher limit for grouped aggregations
          offset: 0
        };
      }
    }
    return void 0;
  }
};
export {
  ExecutionPlanMapper,
  QueryIntentDetector,
  QueryPlanner,
  SemanticCollector
};
