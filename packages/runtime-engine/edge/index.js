// src/create-runtime-engine.ts
import { assessPlanCompleteness } from "@intelligence/query-planner";
function createRuntimeEngine({
  runtime,
  semantic,
  planner,
  executionPlanMapper,
  executor
}) {
  return {
    async execute(request) {
      console.log(">>> RuntimeEngine.execute()");
      const semanticResult = semantic.resolve(request.question);
      console.log("========== SEMANTIC RESULT ==========");
      console.log(
        JSON.stringify(semanticResult, null, 2)
      );
      console.log("=====================================");
      if (!semanticResult.resolved) {
        return {
          success: false,
          rows: [],
          rowCount: 0,
          error: "Unable to resolve question."
        };
      }
      if (semanticResult.unsupportedNegation) {
        return {
          success: false,
          rows: [],
          rowCount: 0,
          error: 'This question includes an exclusion or negation (e.g. "excluding", "without", "except", "not") that IntelligenceOS cannot yet safely represent. Please rephrase without excluding/negating a value.'
        };
      }
      const plan = planner.createPlan(semanticResult, runtime.domain.metrics);
      if (!plan.success || !plan.plan || plan.plan.semantic.metrics.length === 0) {
        return {
          success: false,
          rows: [],
          rowCount: 0,
          // RCG-010: prefer a specific, natural-language reason (e.g. a
          // detected direction contradiction) when the planner supplied one.
          error: plan.error ?? "Unable to create query plan."
        };
      }
      const executionPlan = executionPlanMapper.map(plan.plan);
      console.log("========== EXECUTION PLAN ==========");
      console.log(JSON.stringify(executionPlan, null, 2));
      console.log("====================================");
      const completeness = assessPlanCompleteness(
        semanticResult.matches,
        executionPlan
      );
      console.log("========== PLAN COMPLETENESS ==========");
      console.log(JSON.stringify(completeness, null, 2));
      console.log("========================================");
      const primaryMetric = plan.plan.semantic.metrics[0]?.canonicalKey;
      const templateId = runtime.domain.executionStrategy.selectTemplateFromPlan ? runtime.domain.executionStrategy.selectTemplateFromPlan(executionPlan) : runtime.domain.executionStrategy.selectTemplate(
        primaryMetric,
        plan.plan.intent
      );
      const template = runtime.sqlResolver.resolve(
        templateId
      );
      console.log("========== RUNTIME ==========");
      console.log("Metrics:", plan.plan.semantic.metrics);
      console.log("Primary Metric:", primaryMetric);
      console.log("Requested Template:", templateId);
      if (template.template) {
        console.log("Resolved Template:", template.template.id);
        console.log(
          "Parameters:",
          template.template.parameters
        );
      }
      if (!template.found || !template.template) {
        return {
          success: false,
          rows: [],
          rowCount: 0,
          error: "SQL template not found."
        };
      }
      const parameters = runtime.domain.executionStrategy.resolveParametersFromPlan ? runtime.domain.executionStrategy.resolveParametersFromPlan(executionPlan) : runtime.domain.executionStrategy.resolveParameters(
        plan.plan.parameters
      );
      console.log("========== PARAMETERS ==========");
      console.log(parameters);
      console.log("================================");
      const primaryResult = await executor.execute(
        template.template,
        parameters
      );
      if (!primaryResult.success) {
        return primaryResult;
      }
      const strategy = runtime.domain.executionStrategy;
      const identityField = strategy.resultIdentityField;
      if (executionPlan.metrics && executionPlan.metrics.length > 1 && identityField && strategy.selectSecondaryMetricTemplate && strategy.resolveSecondaryMetricParameters) {
        const primaryRows = primaryResult.rows;
        const identityValues = primaryRows.map((row) => row[identityField]).filter((value) => value !== void 0 && value !== null);
        const secondaryMetrics = executionPlan.metrics.filter(
          (metric) => metric.metric !== executionPlan.metric
        );
        console.log("========== PHASE 7: SECONDARY METRICS ==========");
        console.log("Identity field:", identityField);
        console.log("Identity values:", identityValues);
        console.log("Secondary metrics:", secondaryMetrics);
        console.log("==================================================");
        for (const secondaryMetric of secondaryMetrics) {
          const secondaryTemplateId = strategy.selectSecondaryMetricTemplate(
            secondaryMetric,
            executionPlan
          );
          const secondaryTemplate = runtime.sqlResolver.resolve(secondaryTemplateId);
          if (!secondaryTemplate.found || !secondaryTemplate.template) {
            return {
              success: false,
              rows: [],
              rowCount: 0,
              error: `SQL template not found for requested metric "${secondaryMetric.metric}".`
            };
          }
          const secondaryParameters = strategy.resolveSecondaryMetricParameters(
            secondaryMetric,
            executionPlan,
            identityValues
          );
          const secondaryResult = await executor.execute(
            secondaryTemplate.template,
            secondaryParameters
          );
          if (!secondaryResult.success) {
            return {
              success: false,
              rows: [],
              rowCount: 0,
              error: `Failed to execute requested metric "${secondaryMetric.metric}": ${secondaryResult.error ?? "unknown error"}`
            };
          }
          const secondaryRows = secondaryResult.rows;
          const secondaryIndex = /* @__PURE__ */ new Map();
          for (const row of secondaryRows) {
            secondaryIndex.set(row[identityField], row);
          }
          for (const row of primaryRows) {
            const match = secondaryIndex.get(row[identityField]);
            if (match) {
              for (const [key, value] of Object.entries(match)) {
                if (key !== identityField) {
                  row[key] = value;
                }
              }
            }
          }
        }
      }
      return { ...primaryResult, completeness };
    }
  };
}
export {
  createRuntimeEngine
};
