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
    if (q.includes("average") || q.includes("count") || q.includes("total")) {
      return "aggregation";
    }
    return "lookup";
  }
};

// src/query-planner.ts
var QueryPlanner = class {
  intentDetector = new QueryIntentDetector();
  createPlan(semantic) {
    if (!semantic.resolved || !semantic.canonicalKey) {
      return {
        success: false,
        plan: null
      };
    }
    const intent = this.intentDetector.detect(
      semantic.originalQuery
    );
    console.log("========== QUERY PLANNER ==========");
    console.log("Metric :", semantic.canonicalKey);
    console.log("Intent :", intent);
    console.log("Planner Intent:", intent);
    return {
      success: true,
      plan: {
        metricId: semantic.canonicalKey,
        intent,
        dimensions: [],
        filters: []
      }
    };
  }
};
export {
  QueryIntentDetector,
  QueryPlanner
};
