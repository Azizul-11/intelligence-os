// src/create-runtime-engine.ts
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
      const plan = planner.createPlan(semanticResult);
      if (!plan.success || !plan.plan || plan.plan.semantic.metrics.length === 0) {
        return {
          success: false,
          rows: [],
          rowCount: 0,
          error: "Unable to create query plan."
        };
      }
      const executionPlan = executionPlanMapper.map(plan.plan);
      console.log("========== EXECUTION PLAN ==========");
      console.log(JSON.stringify(executionPlan, null, 2));
      console.log("====================================");
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
      return executor.execute(
        template.template,
        parameters
      );
    }
  };
}
export {
  createRuntimeEngine
};
