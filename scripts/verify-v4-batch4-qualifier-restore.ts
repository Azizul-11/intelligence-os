#!/usr/bin/env tsx
/** V4 Batch 4: qualifier-restore branch (`request.rewrittenFrom`) in create-runtime-engine.ts, driven via engine.execute({ question, rewrittenFrom })
 * since Batch 1 makes these resolve first pass. No LLM; live SELECTs. Usage: pnpm exec tsx scripts/verify-v4-batch4-qualifier-restore.ts */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { expandUppercaseStateAbbreviations } from "../domain-packs/healthcare/src/runtime/state-abbreviation-preprocessor";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { SqlExecutor } from "../packages/sql-executor/src/sql-executor";
import { SupabaseDatabaseAdapter } from "../packages/sql-executor/src/supabase-database-adapter";
import { env } from "./shared/env";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  [PASS] ${name}`);
  } else {
    failed++;
    console.log(`  [FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
}

const runtime = createDomainRuntime(healthcareDomain);
const engine = createRuntimeEngine({
  runtime,
  semantic: createSemanticResolver(runtime.registry, runtime.entityProvider),
  planner: new QueryPlanner(),
  executionPlanMapper: new ExecutionPlanMapper(),
  executor: new SqlExecutor(new SupabaseDatabaseAdapter(createClient(env.supabaseUrl, env.supabaseServiceRoleKey))),
  preprocessQuestion: expandUppercaseStateAbbreviations,
});
const realLog = console.log;
async function run(question: string, rewrittenFrom?: string) {
  console.log = () => {};
  try {
    return await engine.execute({ question, ...(rewrittenFrom ? { rewrittenFrom } : {}) } as any);
  } finally {
    console.log = realLog;
  }
}
const gate = (r: any, phase: string) => (r.trace ?? []).find((t: any) => t.phase === phase && t.status !== "enter");
const gates = (r: any, phase: string) => (r.trace ?? []).filter((t: any) => t.phase === phase && t.status !== "enter");

async function main() {
  console.log("Batch 4 - qualifier restore\n");

  // 1. dropped hospital type: the model's rewrite (V4_0103 shape) carries no acute-care key at all; the raw text
  // does ("nonprofit acute hospitals").
  {
    const r = await run(
      "Show me non-profit hospitals with highest Mortality Rate for Stroke in New Mexico",
      "one sec, show me nonprofit acute hospitals in New Mexico with the highest stroke mortality lol",
    );
    check("acute care restored: executes (not refused)", r.success === true, JSON.stringify({ success: r.success, error: r.error }));
    check("acute care restored: hospitalType bound to Acute Care Hospitals", r.executedParameters?.hospitalType === "Acute Care Hospitals", JSON.stringify(r.executedParameters));
    check("acute care restored: ownership still Voluntary non-profit (the rewrite's own value, not overridden)", String(r.executedParameters?.ownership ?? "").startsWith("Voluntary non-profit"), JSON.stringify(r.executedParameters));
    check("acute care restored: trace shows exactly one qualifier-restore gate, status restored", gates(r, "qualifier-restore").length === 1 && gate(r, "qualifier-restore")?.status === "restored", JSON.stringify(gates(r, "qualifier-restore")));
    check("acute care restored: the restored phrase is named on the trace", String(gate(r, "qualifier-restore")?.detail?.restored ?? "").includes("acute"), JSON.stringify(gate(r, "qualifier-restore")?.detail));
  }

  // 2. dropped ownership: the rewrite drops "non-profit" entirely (V4_0120 shape).
  {
    const r = await run(
      "Show me hospitals with highest Mortality Rate for Heart Failure in Georgia",
      "My husband has heart failure and it keeps getting worse - what are the bottom 3 not-for-profit acute-care emergency services hospitals in Georgia by heart failure mortality?",
    );
    check("ownership restored: executes", r.success === true, JSON.stringify({ success: r.success, error: r.error }));
    check("ownership restored: bound to Voluntary non-profit", String(r.executedParameters?.ownership ?? "").startsWith("Voluntary non-profit"), JSON.stringify(r.executedParameters));
    check("ownership restored: emergency services also restored (a second lost qualifier, same pass)", r.executedParameters?.emergencyServices === true || r.executedParameters?.emergencyServices === "true", JSON.stringify(r.executedParameters));
  }

  // 3. dropped flag (birthing-friendly dropped): V4_0097 shape.
  {
    const r = await run(
      "Show me local government hospitals with lowest Hospital-Wide Mortality in Kansas",
      "We're having a baby in the fall. Show me city-owned maternity hospitals in Kansas with the lowest hospital-wide death rate.",
    );
    check("birthing-friendly restored: executes", r.success === true, JSON.stringify({ success: r.success, error: r.error }));
    check("birthing-friendly restored: bound", r.executedParameters?.birthingFriendly === "Y" || r.executedParameters?.birthingFriendly === true, JSON.stringify(r.executedParameters));
    check("birthing-friendly restored: local government kept (the rewrite's own value)", String(r.executedParameters?.ownership ?? "").startsWith("Government - Local"), JSON.stringify(r.executedParameters));
  }

  // 4. dropped 5-star filter: V4_0422 shape (star rating dropped alongside a kept PSI name).
  {
    const r = await run(
      "Show me proprietary hospitals in West Virginia with lowest Patient Safety Indicator for Pressure Ulcer",
      "My dad will be in a bed for weeks after surgery, so I'm looking for 5-star proprietary hospitals in West Virginia with the lowest pressure ulcer rate.",
    );
    check("5-star restored: executes", r.success === true, JSON.stringify({ success: r.success, error: r.error }));
    check("5-star restored: overallRating bound to 5", String(r.executedParameters?.overallRating ?? "") === "5", JSON.stringify(r.executedParameters));
  }

  // 5. sentinel: nothing lost - the rewrite already carries every preserved parameter the raw question named. No
  // restore gate fires, and the answer is unaffected (this is the majority case: 163 of 270 qualified V4 rows).
  {
    const r = await run(
      "Show me non-profit critical access hospitals in Washington with lowest Mortality Rate for COPD",
      "Which non-profit critical access hospitals in Washington have the lowest death rate for COPD?",
    );
    check("nothing lost: no qualifier-restore gate fires", gates(r, "qualifier-restore").length === 0, JSON.stringify(r.trace?.map((t: any) => t.phase + ":" + t.status)));
    check("nothing lost: still executes normally", r.success === true);
  }

  // 6. sentinel: a named, uniquely-identified hospital in the RAW question - restore must not fire (the unique-record
  // guard), even though the rewrite text looks, superficially, like it dropped a qualifier.
  {
    const r = await run("What type of hospital is Mayo Clinic", "Is Mayo Clinic a non-profit hospital?");
    check("named hospital: no qualifier-restore gate fires", gates(r, "qualifier-restore").length === 0, JSON.stringify(r.trace?.map((t: any) => t.phase + ":" + t.status)));
  }

  // 7. sentinel: a question with no preserved-parameter qualifier at all in the raw text (nothing to restore).
  {
    const r = await run("Show me hospitals in Ohio", "hospitals in oh");
    check("no qualifier in raw text: no qualifier-restore gate fires", gates(r, "qualifier-restore").length === 0);
    check("no qualifier in raw text: still executes", r.success === true && (r.rowCount ?? 0) > 0);
  }

  // 8. regression: first-pass (no rewrite) questions are completely untouched - the restore block is gated on
  // request.rewrittenFrom, which a first pass never sets.
  {
    const r = await run("hospitals in Texas");
    check("first pass: no qualifier-restore gate (mechanism scoped to rewritten runs only)", gates(r, "qualifier-restore").length === 0);
    check("first pass: still executes", r.success === true);
  }

  // 9. bounded to one attempt: qualifierRestoreAttempted must not be set by an external caller in ordinary use, but
  // if a second recursive pass were somehow re-entered with it already true, the mechanism must not restore twice.
  {
    console.log = () => {};
    let r: any;
    try {
      r = await engine.execute({
        question: "Show me hospitals with highest Mortality Rate for Heart Failure in Georgia",
        rewrittenFrom: "not-for-profit acute-care hospitals in Georgia by heart failure mortality",
        qualifierRestoreAttempted: true,
      } as any);
    } finally {
      console.log = realLog;
    }
    check("bounded: an already-attempted request does not restore again", gates(r, "qualifier-restore").length === 0, JSON.stringify(gates(r, "qualifier-restore")));
  }

  console.log(`\n${"=".repeat(60)}\nRESULT: ${passed} passed, ${failed} failed (${passed + failed} total)\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("FATAL:", e instanceof Error ? e.stack : e);
  process.exit(1);
});
