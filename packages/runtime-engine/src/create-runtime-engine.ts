import type { DomainRuntime } from "@intelligence/domain-runtime";
import type { QueryPlanner } from "@intelligence/query-planner";
import type { SqlExecutor } from "@intelligence/sql-executor";
import type {
  SemanticResolver,
} from "@intelligence/semantic";

import type { RuntimeEngine } from "./runtime-engine";
import type { RuntimeRequest } from "./runtime-request";
import type { RuntimeResult } from "./runtime-result";



type CreateRuntimeEngineOptions = {
  runtime: DomainRuntime;
  semantic: SemanticResolver;
  planner: QueryPlanner;
  executor: SqlExecutor;
};
export function createRuntimeEngine({
  runtime,
  semantic,
  planner,
  executor,
}: CreateRuntimeEngineOptions): RuntimeEngine {
  return {
    async execute(
  request: RuntimeRequest,
): Promise<RuntimeResult> {
      const semanticResult = semantic.resolve(
        request.question,
      );

      if (!semanticResult.resolved) {
        return {
          success: false,
          rows: [],
          rowCount: 0,
          error: "Unable to resolve question.",
        };
      }

      const plan = planner.createPlan(
        semanticResult,
      );

     if (
  !plan.success ||
  !plan.plan ||
  !plan.plan.metricId
) {
  return {
    success: false,
    rows: [],
    rowCount: 0,
    error: "Unable to create query plan.",
  };
}

      const template =
        runtime.sqlResolver.resolve(
          plan.plan.metricId,
        );

      if (!template.found || !template.template) {
        return {
          success: false,
          rows: [],
          rowCount: 0,
          error: "SQL template not found.",
        };
      }

      return executor.execute(
        template.template,
        request.parameters ?? {},
      );
    },
  };
}