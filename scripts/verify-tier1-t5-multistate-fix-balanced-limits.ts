/**
 * Pre-Phase 9 Tier1 Task 5 Balanced Limits Fix Verification: Restore
 * Sanity — Top N Per State Partitioning — Production-Grade.
 *
 * SUPERSEDES the same-day true-raw / no-limit fix
 * (verify-tier1-t5-multistate-fix-true-raw.ts): dumping every matching
 * row (3182 for a bare nationwide ranking, 497/666 for multi-state) is
 * a real payload/UX problem, not the correct end state. This is the
 * authoritative post-fix verification for the final, production-grade
 * behavior:
 *   - Single-state / nationwide ranking: top 10 (unchanged from before
 *     Task 5 ever touched these templates).
 *   - Multi-state ranking: top 5 PER named state (ROW_NUMBER() OVER
 *     PARTITION BY state), so every requested state gets fair,
 *     balanced representation instead of one state's tied hospitals
 *     crowding out another's.
 *   - Single-state listing (hospital-list-by-state.ts): sensible
 *     ceiling of 100 (unchanged).
 *   - Multi-state listing: up to 50 PER named state (same partitioning
 *     mechanism), so an alphabetically-earlier state with more
 *     hospitals can't crowd another state out of the ceiling entirely.
 *
 * Live, in-process, spy-instrumented against the remote Supabase warehouse.
 * Run: npx tsx scripts/verify-tier1-t5-multistate-fix-balanced-limits.ts
 */
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

async function run(question: string) {
  const result = await engine.execute({ question });
  const rows = (result.rows ?? []) as any[];
  const states = Array.from(new Set(rows.map((r) => r.state).filter(Boolean)));
  const perState: Record<string, number> = {};
  for (const row of rows) if (row.state) perState[row.state] = (perState[row.state] ?? 0) + 1;
  console.log(`    "${question}" -> success=${result.success} rowCount=${result.rowCount} states=${JSON.stringify(states)} perState=${JSON.stringify(perState)}`);
  return { result, rows, states, perState };
}

async function main() {
  console.log("=".repeat(100));
  console.log("TIER1 TASK 5 BALANCED LIMITS FIX VERIFICATION (POST-FIX, PRODUCTION-GRADE)");
  console.log("=".repeat(100));

  console.log("\n--- Group A: multi-state RANKING - top 5 PER state, balanced, no crowd-out, no payload dump ---");
  {
    const { result, states, perState } = await run("Best hospitals in Texas and California");
    check("A-1", "2-state ranking: exactly 10 rows, exactly 5 per state", result.rowCount === 10 && perState.TX === 5 && perState.CA === 5 && states.length === 2, `rowCount=${result.rowCount} perState=${JSON.stringify(perState)}`);
  }
  {
    const { result, perState } = await run("Best hospitals in Texas, California and Florida");
    check("A-2", "3-state ranking: exactly 15 rows, exactly 5 per state, all 3 states", result.rowCount === 15 && perState.TX === 5 && perState.CA === 5 && perState.FL === 5, `rowCount=${result.rowCount} perState=${JSON.stringify(perState)}`);
  }
  {
    const { result, perState } = await run("Show me hospitals with best overall rating in Texas and California");
    check("A-3", "explicit 'best overall rating' phrasing: same balanced 5+5", result.rowCount === 10 && perState.TX === 5 && perState.CA === 5, `rowCount=${result.rowCount} perState=${JSON.stringify(perState)}`);
  }
  {
    const { result, perState } = await run("Compare hospital ratings in Texas and California");
    check("A-4", "compare + multi-state: balanced 5+5, rich measure columns, no more 'SQL template not found'", result.rowCount === 10 && perState.TX === 5 && perState.CA === 5 && Object.keys(result.rows?.[0] ?? {}).length > 7, `rowCount=${result.rowCount} perState=${JSON.stringify(perState)} columns=${Object.keys(result.rows?.[0] ?? {}).length}`);
  }
  {
    const { result, perState } = await run("Compare hospital ratings in Texas, California and Florida");
    check("A-5", "compare + 3-state: balanced 5 per state, 15 total", result.rowCount === 15 && perState.TX === 5 && perState.CA === 5 && perState.FL === 5, `rowCount=${result.rowCount} perState=${JSON.stringify(perState)}`);
  }
  {
    const [{ result: forward }, { result: reversed }] = await Promise.all([run("Best hospitals in Texas and California"), run("Best hospitals in California and Texas")]);
    check("A-6", "order-agnostic: same balanced rowCount regardless of mention order", forward.rowCount === reversed.rowCount && forward.rowCount === 10, `forward=${forward.rowCount} reversed=${reversed.rowCount}`);
  }

  console.log("\n--- Group B: multi-state LISTING - up to 50 PER state, balanced, no crowd-out ---");
  {
    const { result, perState } = await run("Show me hospitals in Texas and California");
    check("B-1", "2-state listing: exactly 100 rows, exactly 50 per state (both states have >50 hospitals)", result.rowCount === 100 && perState.TX === 50 && perState.CA === 50, `rowCount=${result.rowCount} perState=${JSON.stringify(perState)}`);
  }
  {
    const { result, perState } = await run("Compare hospitals in Ohio and Michigan");
    check("B-2", "compare + bare hospital-list metric: balanced, <=50 per state, <=100 total, both states present", result.rowCount! <= 100 && (perState.OH ?? 0) <= 50 && (perState.MI ?? 0) <= 50 && !!perState.OH && !!perState.MI, `rowCount=${result.rowCount} perState=${JSON.stringify(perState)}`);
  }
  {
    const { result, perState } = await run("Show me 5-star hospitals in Texas and California");
    const allFive = result.rows!.every((r: any) => String(r.overall_rating) === "5");
    check("B-3", "5-star listing (already below the 50/state cap): unaffected, 58 rows (29+29), all rating 5", result.rowCount === 58 && perState.TX === 29 && perState.CA === 29 && allFive, `rowCount=${result.rowCount} perState=${JSON.stringify(perState)} allFive=${allFive}`);
  }

  console.log("\n--- Group C: single-state / nationwide - back to the ORIGINAL sensible ceilings (10 ranking, 100 listing) ---");
  {
    const { result, states } = await run("Best hospitals in Texas");
    check("C-1", "single-state ranking: top 10, TX only (unaffected by multi-state balancing)", result.rowCount === 10 && states.length === 1 && states[0] === "TX", `rowCount=${result.rowCount} states=${JSON.stringify(states)}`);
  }
  {
    const { result, states } = await run("Show me hospitals in Texas");
    check("C-2", "single-state listing: 100-row ceiling, TX only", result.rowCount === 100 && states.length === 1 && states[0] === "TX", `rowCount=${result.rowCount} states=${JSON.stringify(states)}`);
  }
  {
    const { result } = await run("Show me hospitals with best overall rating");
    check("C-3", "nationwide ranking (no state at all): top 10, NOT 3182 - no payload dump", result.rowCount === 10, `rowCount=${result.rowCount}`);
  }
  {
    const { result } = await run("hospitals with lowest readmissions");
    check("C-4", "nationwide readmission ranking: top 10, NOT 4276", result.rowCount === 10, `rowCount=${result.rowCount}`);
  }
  {
    const { result } = await run("Show me hospitals with best heart attacks mortality");
    check("C-5", "nationwide condition-specific ranking: top 10, NOT 1952, still scoped to MORT_30_AMI", result.rowCount === 10 && result.rows!.every((r: any) => r.measure_code === "MORT_30_AMI"), `rowCount=${result.rowCount}`);
  }

  console.log("\n--- Group D: Task 1-6 + Tier1 T1-T4 controls (must preserve, no regression) ---");
  {
    const { result } = await run("What is Mayo Clinic Rochester Minnesota's overall rating?");
    check("D-1", "Task 3 control: Mayo Rochester facility 240010", result.success === true && result.rows![0]?.facility_id === "240010", `facility_id=${result.rows?.[0]?.facility_id}`);
  }
  {
    const { result } = await run("Show me hospitals in Birmingham, Alabama with their overall ratings");
    check("D-2", "Task 2 control: Birmingham 9 rows (below any cap, unaffected)", result.success === true && result.rowCount === 9, `rowCount=${result.rowCount}`);
  }
  {
    const { result } = await run("Show me hospitals in ALBANY County, New York");
    check("D-3", "Task 1 control: ALBANY NY 4 rows (below any cap, unaffected)", result.success === true && result.rowCount === 4, `rowCount=${result.rowCount}`);
  }
  {
    const { result } = await run("Show me 5-star hospitals in Texas");
    check("D-4", "Tier1 T2 control: single-state 5-star, 29 rows (below any cap, unaffected)", result.success === true && result.rowCount === 29, `rowCount=${result.rowCount}`);
  }
  {
    const { result } = await run("Tell me about Mayo Clinic");
    check("D-5", "Tier1 T4 control: rich 22-column dossier preserved (single hospital, no cap concern)", result.success === true && Object.keys(result.rows![0]).length === 22, `columns=${Object.keys(result.rows?.[0] ?? {}).length}`);
  }
  {
    const { result } = await run("Compare NYU LANGONE HOSPITALS vs CEDARS-SINAI MEDICAL CENTER");
    check("D-6", "Tier1 T4 control: hospital-identity compare unaffected (2 rows, 15 columns - a different code path, no per-state cap)", result.success === true && result.rowCount === 2 && Object.keys(result.rows![0]).length === 15, `rowCount=${result.rowCount} columns=${Object.keys(result.rows?.[0] ?? {}).length}`);
  }

  console.log("\n--- Known separate gaps: must still FAIL (not a regression) ---");
  {
    const { result } = await run("Top non-profit hospitals in Texas and California");
    check("K-1", "hospital-list-ranking gap still fails safely (pre-existing, unrelated to balancing)", result.success === false, `success=${result.success}`);
  }
  {
    const { result } = await run("Show me hospitals with best ratings");
    check("K-2", "bare 'ratings' still fails (F13, out of scope)", result.success === false, `success=${result.success}`);
  }

  console.log("\n" + "=".repeat(100));
  console.log(`RESULT: ${pass} PASS, ${fail} FAIL`);
  console.log("=".repeat(100));

  console.log("\n--- Supplementary DB checks ---");
  const { count: txCaCount } = await client.from("warehouse_hospitals").select("*", { count: "exact", head: true }).in("state", ["TX", "CA"]);
  console.log(`SELECT COUNT(*) FROM warehouse_hospitals WHERE state IN ('TX','CA'): ${txCaCount} (true raw total - NOT what balanced-limits returns; balanced returns 100 at most, 50/state)`);
  const { count: txCa5Count } = await client.from("warehouse_hospitals").select("*", { count: "exact", head: true }).in("state", ["TX", "CA"]).eq("overall_rating", "5");
  console.log(`SELECT COUNT(*) FROM warehouse_hospitals WHERE state IN ('TX','CA') AND overall_rating='5': ${txCa5Count} (58, below the 50/state cap - unaffected)`);
  const { count: nationwideRatedCount } = await client.from("warehouse_hospitals").select("*", { count: "exact", head: true }).not("overall_rating", "is", null);
  console.log(`SELECT COUNT(*) FROM warehouse_hospitals WHERE overall_rating IS NOT NULL: ${nationwideRatedCount} (true raw total - balanced-limits returns 10 nationwide, not this)`);

  if (fail > 0) process.exit(1);
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
