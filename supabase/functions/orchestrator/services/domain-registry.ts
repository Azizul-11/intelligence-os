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
let sharedExecutor: SqlExecutor | undefined;

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
  sharedExecutor = executor;

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

/**
 * Tier0 Task 2 (F8): direct, deterministic single-hospital rating lookup
 * by facility_id - used by the hospital-ranking clarification's "lookup"
 * Turn 2 (see reconstruct-hospital-choice.ts). Deliberately bypasses the
 * full NL semantic pipeline: re-typing a hospital's own stored name and
 * re-resolving it is not guaranteed to round-trip to the same facility
 * (see reconstruct-hospital-choice.ts's own comment), whereas the
 * facility_id captured at Turn 1 is unambiguous already. Reuses the
 * existing, already-registered `hospital-overall-rating` template
 * verbatim - no new SQL template.
 */
export async function lookupHospitalOverallRating(facilityId: string) {
  if (!domainRuntime || !sharedExecutor) {
    getRuntimeEngine();
  }

  const template = domainRuntime!.sqlResolver.resolve("hospital-overall-rating");

  if (!template.found || !template.template) {
    return { success: false, rows: [], rowCount: 0, error: "Lookup template unavailable" };
  }

  return sharedExecutor!.execute(template.template, { hospitalId: facilityId });
}
