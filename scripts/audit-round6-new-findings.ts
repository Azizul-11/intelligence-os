/**
 * Audit Round 6 — targeted live evidence for the NEW bugs reported
 * (entity-resolution dossier failures, silent-wrong pneumonia comparison,
 * Ohio no-ranking-word, public ownership alias) plus reconfirmation of
 * yesterday's still-open bugs (safest, strongest). Read-only audit - no
 * code changes made based on this script's output.
 *
 * Run: npx tsx scripts/audit-round6-new-findings.ts
 */
import "dotenv/config";

import { healthcareDomain, DOMAIN_CAPABILITIES } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { SqlExecutor } from "../packages/sql-executor/src/sql-executor";
import { SupabaseDatabaseAdapter } from "../packages/sql-executor/src/supabase-database-adapter";
import { createClient } from "@supabase/supabase-js";
import { llmGateway } from "../packages/llm-model-gateway/src/llm-model-gateway";
import { env } from "./shared/env";

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
const planner = new QueryPlanner();
const mapper = new ExecutionPlanMapper();
const client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
const adapter = new SupabaseDatabaseAdapter(client);
const executor = new SqlExecutor(adapter);
const engine = createRuntimeEngine({
  runtime,
  semantic,
  planner,
  executionPlanMapper: mapper,
  executor,
  llmFallback: async (question: string) => {
    const result = await llmGateway.normalizeMessyLanguage(question, DOMAIN_CAPABILITIES);
    if (result.status === "ok" && result.canonical_question) return { canonicalQuestion: result.canonical_question };
    if (result.status === "need_clarification" && result.reason) return { clarification: result.reason };
    return null;
  },
});

const QUERIES: { id: string; q: string }[] = [
  // Entity resolution - ADVENTIST HEALTH HOWARD MEMORIAL (051310, Willits CA)
  { id: "E1", q: "ADVENTIST HEALTH HOWARD MEMORIAL" },
  { id: "E2", q: "tell me about ADVENTIST HEALTH HOWARD MEMORIAL" },
  { id: "E3", q: "show me ADVENTIST HEALTH HOWARD MEMORIAL" },
  { id: "E4", q: "ADVENTIST HEALTH HOWARD MEMORIAL hospital" },
  // Entity resolution - ADVENTHEALTH GORDON (110023, Calhoun GA)
  { id: "E5", q: "ADVENTHEALTH GORDON" },
  { id: "E6", q: "tell me about ADVENTHEALTH GORDON" },
  { id: "E7", q: "show me ADVENTHEALTH GORDON" },
  { id: "E8", q: "tell me about ADVENTHEALTH GORDON hospital" },
  // Entity resolution - BAPTIST NEIGHBORHOOD HOSPITAL THOUSAND OAKS (670078, San Antonio TX)
  { id: "E9", q: "BAPTIST NEIGHBORHOOD HOSPITAL THOUSAND OAKS" },
  { id: "E10", q: "tell me about BAPTIST NEIGHBORHOOD HOSPITAL THOUSAND OAKS" },
  // Silent-wrong: condition-specific comparison
  { id: "P1", q: "Compare Readmission Rates for Pneumonia in Florida vs Georgia" },
  { id: "P2", q: "pneumonia readmission Florida" },
  // Ohio no-ranking-word
  { id: "O1", q: "Hospital Overall Rating in Ohio" },
  // Public ownership alias
  { id: "PU1", q: "California public hospitals and their Patient Experience scores" },
  { id: "PU2", q: "public hospitals in Texas" },
  // Reconfirm still-open findings
  { id: "S1", q: "safest hospitals in Texas" },
  { id: "S2", q: "Compare the strongest hospitals in Texas and California." },
  { id: "S3", q: "what's the weather in Texas?" },
];

async function main() {
  for (const { id, q } of QUERIES) {
    try {
      const result = await engine.execute({ question: q });
      const rows = (result.rows ?? []) as Record<string, unknown>[];
      console.log(
        JSON.stringify({
          id,
          query: q,
          success: result.success,
          rowCount: result.rowCount,
          error: result.error,
          answerabilityStatus: result.answerability?.status,
          answerabilityReason: result.answerability?.reason,
          topRows: rows.slice(0, 3).map((r) => ({
            facility_id: r.facility_id,
            hospital_name: r.hospital_name,
            city: r.city,
            state: r.state,
            overall_rating: r.overall_rating,
            measure_code: r.measure_code,
            readm_measures_worse: r.readm_measures_worse,
            readm_measures_better: r.readm_measures_better,
            excess_readmission_ratio: r.excess_readmission_ratio,
          })),
        }),
      );
    } catch (error) {
      console.log(JSON.stringify({ id, query: q, FATAL: String(error) }));
    }
  }
}
main();
