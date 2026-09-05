import { healthcareDomain } from "@intelligence/healthcare-domain";

import { createDomainRuntime } from "@intelligence/domain-runtime";
import { createSemanticResolver } from "@intelligence/semantic";
import { QueryPlanner, ExecutionPlanMapper } from "@intelligence/query-planner";
import {
  SqlExecutor,
  SupabaseDatabaseAdapter,
} from "@intelligence/sql-executor";
import { createRuntimeEngine } from "@intelligence/runtime-engine";

import { supabase } from "../../shared/supabase.ts";

import type { RuntimeEngine } from "@intelligence/runtime-engine";

import * as RuntimeEngineModule from "@intelligence/runtime-engine";

let runtimeEngine: RuntimeEngine | undefined;
let domainRuntime: ReturnType<typeof createDomainRuntime> | undefined;

export function getRuntimeEngine(): RuntimeEngine {
  if (runtimeEngine) {
    return runtimeEngine;
  }

  const runtime = createDomainRuntime(healthcareDomain);
  domainRuntime = runtime;

  const semantic = createSemanticResolver(
    runtime.registry,
    runtime.entityProvider,
  );

  const planner = new QueryPlanner();

  const executor = new SqlExecutor(
    new SupabaseDatabaseAdapter(supabase),
  );

  console.log(
  "Runtime Engine Module:",
  RuntimeEngineModule,
);

  runtimeEngine = createRuntimeEngine({
    runtime,
    semantic,
    planner,
    executionPlanMapper: new ExecutionPlanMapper(),
    executor,
  });

  return runtimeEngine;
}


/**
 * Get domain metrics for display name lookup.
 * Phase 8.10 Layer 2: Used by guidance Turn 1 to map capability IDs to display names.
 */
export function getDomainMetrics(): readonly any[] {
  // Ensure runtime is initialized
  if (!domainRuntime) {
    getRuntimeEngine();
  }
  return domainRuntime?.domain?.metrics || [];
}
