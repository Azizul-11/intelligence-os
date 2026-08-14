import type { DomainRuntime } from "@intelligence/domain-runtime";
import type { QueryPlanner, ExecutionPlanMapper } from "@intelligence/query-planner";
import type { SqlExecutor } from "@intelligence/sql-executor";
import type { SemanticResolver } from "@intelligence/semantic";

import type { RuntimeEngine } from "./runtime-engine";
import type { RuntimeRequest } from "./runtime-request";
import type { RuntimeResult } from "./runtime-result";

type CreateRuntimeEngineOptions = {
  runtime: DomainRuntime;
  semantic: SemanticResolver;
  planner: QueryPlanner;
  executionPlanMapper: ExecutionPlanMapper;
  executor: SqlExecutor;
};
export function createRuntimeEngine({
  runtime,
  semantic,
  planner,
  executionPlanMapper,
  executor,
}: CreateRuntimeEngineOptions): RuntimeEngine {
  return {
    async execute(request: RuntimeRequest): Promise<RuntimeResult> {
      console.log(">>> RuntimeEngine.execute()");
      const semanticResult = semantic.resolve(request.question);

console.log("========== SEMANTIC RESULT ==========");
console.log(
  JSON.stringify(semanticResult, null, 2),
);
console.log("=====================================");

      if (!semanticResult.resolved) {
        return {
          success: false,
          rows: [],
          rowCount: 0,
          error: "Unable to resolve question.",
        };
      }

      const plan = planner.createPlan(semanticResult);

    if (
  !plan.success ||
  !plan.plan ||
  plan.plan.semantic.metrics.length === 0
) {
  return {
    success: false,
    rows: [],
    rowCount: 0,
    error: "Unable to create query plan.",
  };
}

// Phase 5.3: Create ExecutionPlan from QueryPlan
const executionPlan = executionPlanMapper.map(plan.plan);

console.log("========== EXECUTION PLAN ==========");
console.log(JSON.stringify(executionPlan, null, 2));
console.log("====================================");

const primaryMetric =
  plan.plan.semantic.metrics[0]?.canonicalKey;

// Phase 5.3: Use ExecutionPlan if domain strategy supports it
const templateId = runtime.domain.executionStrategy.selectTemplateFromPlan
  ? runtime.domain.executionStrategy.selectTemplateFromPlan(executionPlan)
  : runtime.domain.executionStrategy.selectTemplate(
      primaryMetric!,
      plan.plan.intent,
    );

const template =
  runtime.sqlResolver.resolve(
    templateId,
  );

  console.log("========== RUNTIME ==========");
console.log("Metrics:", plan.plan.semantic.metrics);
console.log("Primary Metric:", primaryMetric);
console.log("Requested Template:", templateId);

if (template.template) {
  console.log("Resolved Template:", template.template.id);
  console.log(
    "Parameters:",
    template.template.parameters,
  );
}

      if (!template.found || !template.template) {
        return {
          success: false,
          rows: [],
          rowCount: 0,
          error: "SQL template not found.",
        };
      }

// Phase 5.3: Use ExecutionPlan if domain strategy supports it
const parameters = runtime.domain.executionStrategy.resolveParametersFromPlan
  ? runtime.domain.executionStrategy.resolveParametersFromPlan(executionPlan)
  : runtime.domain.executionStrategy.resolveParameters(
      plan.plan.parameters,
    );

console.log("========== PARAMETERS ==========");
console.log(parameters);
console.log("================================");

return executor.execute(
  template.template,
  parameters,
);
    },
  };
}
