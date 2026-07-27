// demo-runner.ts contains the orchestration logic.

import { healthcareDomain } from "@intelligence/healthcare-domain";
import { createDomainRuntime } from "@intelligence/domain-runtime";
import { createSemanticResolver } from "@intelligence/semantic";
import { QueryPlanner } from "@intelligence/query-planner";
import {
  SqlExecutor,
  SupabaseDatabaseAdapter,
} from "@intelligence/sql-executor";

import { supabase } from "../shared/supabase";
import type { DemoScenario } from "./demo-scenarios";

export class DemoRunner {
  private readonly runtime = createDomainRuntime(
    healthcareDomain,
  );

  private readonly resolver =
    createSemanticResolver(
      this.runtime.registry,
    );

  private readonly planner =
    new QueryPlanner();

  private readonly executor =
    new SqlExecutor(
      new SupabaseDatabaseAdapter(
        supabase,
      ),
    );

  async runScenario(
  scenario: DemoScenario,
): Promise<void> {
  console.log("");
  console.log("==================================================");
  console.log(`Scenario : ${scenario.name}`);
  console.log(`Question : ${scenario.question}`);
  console.log("==================================================");

  // -------------------------------------------------
  // 1. Semantic Resolution
  // -------------------------------------------------

  const semantic = this.resolver.resolve(
    scenario.question,
  );

  console.log("\n[Semantic Resolution]");
  console.log(semantic);

  if (!semantic.resolved) {
    console.log("\n❌ Semantic resolution failed.");

    if (!scenario.shouldResolve) {
      console.log("✅ Expected failure.");
    }

    return;
  }

  // -------------------------------------------------
  // 2. Query Planning
  // -------------------------------------------------

  const queryPlan =
    this.planner.createPlan(semantic);

  console.log("\n[Query Plan]");
  console.log(queryPlan);

  if (!queryPlan.success || !queryPlan.plan) {
    console.log("❌ Query planning failed.");
    return;
  }


  


  // -------------------------------------------------
  // 3. SQL Template Resolution
  // -------------------------------------------------

  const sqlTemplate =
    this.runtime.sqlResolver.resolve(
      queryPlan.plan.metricId,
    );

  console.log("\n[SQL Template]");
  console.log(sqlTemplate);

  if (!sqlTemplate.found || !sqlTemplate.template) {
    console.log("❌ SQL template not found.");
    return;
  }

  console.log("========== TEMPLATE DEBUG ==========");
console.log(sqlTemplate.template);
console.log("====================================");
// -------------------------------------------------
// 4. SQL Execution
// -------------------------------------------------

try {
  const execution =
    await this.executor.execute(
      sqlTemplate.template,
      scenario.parameters,
    );

  console.log("\n[Execution]");
  console.log(execution);

  console.log("\nResult");

  if (execution.success) {
    console.log(
      `✅ Success (${execution.rowCount} rows)`,
    );
  } else {
    console.log("❌ Execution failed");
  }
} catch (error) {
  console.log("\n[Execution]");
  console.error(error);

  console.log("\n❌ Unexpected execution error.");
}



}
}