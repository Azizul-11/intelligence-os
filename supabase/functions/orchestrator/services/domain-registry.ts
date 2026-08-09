import { healthcareDomain } from "@intelligence/healthcare-domain";

import { createDomainRuntime } from "@intelligence/domain-runtime";
import { createSemanticResolver } from "@intelligence/semantic";
import { QueryPlanner } from "@intelligence/query-planner";
import {
  SqlExecutor,
  SupabaseDatabaseAdapter,
} from "@intelligence/sql-executor";
import { createRuntimeEngine } from "@intelligence/runtime-engine";

import { supabase } from "../../shared/supabase.ts";

import type { RuntimeEngine } from "@intelligence/runtime-engine";

import * as RuntimeEngineModule from "@intelligence/runtime-engine";

let runtimeEngine: RuntimeEngine | undefined;

export function getRuntimeEngine(): RuntimeEngine {
  if (runtimeEngine) {
    return runtimeEngine;
  }

  const runtime = createDomainRuntime(healthcareDomain);

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
    executor,
  });

  return runtimeEngine;
}