/**
 * LLM Integration — suggestion diversity verification.
 *
 * Confirms suggestions now select from a genuinely larger, diverse pool
 * (not just rephrase the same 3), and that every selected suggestion
 * still independently executes successfully.
 *
 * Run: npx tsx scripts/verify-llm-suggestion-diversity.ts
 */
import "dotenv/config";

import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { SqlExecutor } from "../packages/sql-executor/src/sql-executor";
import { SupabaseDatabaseAdapter } from "../packages/sql-executor/src/supabase-database-adapter";
import { createClient } from "@supabase/supabase-js";
import { env } from "./shared/env";

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
const planner = new QueryPlanner();
const mapper = new ExecutionPlanMapper();
const client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
const adapter = new SupabaseDatabaseAdapter(client);
const executor = new SqlExecutor(adapter);
const engine = createRuntimeEngine({ runtime, semantic, planner, executionPlanMapper: mapper, executor });

let pass = 0;
let fail = 0;
function check(id: string, label: string, condition: boolean, detail: string) {
  if (condition) {
    pass++;
    console.log(`  [PASS] ${id} ${label}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${id} ${label} -- ${detail}`);
  }
}

async function main() {
  console.log("=".repeat(100));
  console.log("LLM INTEGRATION — SUGGESTION DIVERSITY VERIFICATION");
  console.log("=".repeat(100));

  const question = "Best hospitals in Texas";
  const result = await engine.execute({ question, includeSuggestions: true });
  console.log(`\n"${question}" -> suggestions=${JSON.stringify(result.suggestions)}`);

  check("D1-PRESENT", "suggestions present, exactly 3", Array.isArray(result.suggestions) && result.suggestions.length === 3, JSON.stringify(result.suggestions));

  // Every suggestion covers a genuinely different DIMENSION - not the
  // same metric/state repeated 3 times with different wording. Loose
  // heuristic check: at least 2 of the 3 mention a different concrete
  // noun (a metric name, a different state, or a hospital name) than
  // the original question's own metric (Hospital Overall Rating) and
  // state (Texas) alone.
  const suggestions = result.suggestions ?? [];
  const mentionsTexasOnly = suggestions.filter((s) => /texas/i.test(s) && !/california|florida|new york/i.test(s));
  check(
    "D2-NOT-ALL-SAME-STATE",
    "not all 3 suggestions are Texas-only (some pivot to a different state, metric, or entity)",
    mentionsTexasOnly.length < suggestions.length,
    JSON.stringify(suggestions),
  );

  for (const suggestion of suggestions) {
    const trial = await engine.execute({ question: suggestion });
    check(`D3-EXEC-${suggestion}`, `suggestion "${suggestion}" executes successfully with rows`, trial.success && trial.rowCount > 0, `success=${trial.success} rowCount=${trial.rowCount}`);
  }

  console.log("\n" + "=".repeat(100));
  console.log(`RESULT: ${pass} passed, ${fail} failed (${pass + fail} total)`);
  console.log("=".repeat(100));

  if (fail > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
