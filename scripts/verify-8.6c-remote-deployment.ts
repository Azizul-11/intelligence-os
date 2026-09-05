/**
 * Phase 8.6C - Remote Deployment Verification
 *
 * Exercises the REAL deployed orchestrator function (version 10,
 * uejnblmhappddtbablki) directly over HTTPS, using the exact frontend
 * request shape - never assumed from local/direct-engine behavior.
 *
 * The orchestrator's `ChatResponse` (supabase/functions/orchestrator/
 * types/response.ts) is pre-existing, unmodified by 8.6C, and never
 * forwards `RuntimeResult.coverage` - only `success`, `answer`
 * (stringified rows), `metadata.rowCount`, and `error`. This is the
 * correct, unchanged API boundary (8.6C is explicitly evidence-only
 * and does not extend ChatResponse). Consequently these HTTP checks
 * assert only what that boundary actually carries: success, row
 * presence/count, and error text. The coverage NUMBERS themselves
 * (eligibleCount/coveredCount) are independently reconfirmed against
 * the real remote warehouse via the identical, unchanged
 * `scripts/verify-phase8.6c-coverage.ts` (same source now deployed;
 * see the deployment verification report for that run's results).
 */
import { env } from "./shared/env";

const ORCHESTRATOR_URL = `${env.supabaseUrl}/functions/v1/orchestrator`;

interface Check {
  id: string;
  description: string;
  pass: boolean;
  detail: string;
}

const checks: Check[] = [];

function record(id: string, description: string, pass: boolean, detail: unknown) {
  checks.push({ id, description, pass, detail: JSON.stringify(detail) });
}

async function ask(question: string) {
  const response = await fetch(ORCHESTRATOR_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.supabaseAnonKey}`,
      apikey: env.supabaseAnonKey,
    },
    body: JSON.stringify({ question, domain: "healthcare" }),
  });

  const body = await response.json();
  return { httpStatus: response.status, body };
}

async function run() {
  // TEST 1 - National overall rating. ChatResponse never forwards
  // `coverage` (pre-existing, unmodified boundary) - only success/rows
  // are HTTP-observable here. The coverage NUMBERS themselves are
  // reconfirmed separately via the real-warehouse focused test script.
  {
    const { body } = await ask("best hospitals");
    const rows = body.answer ? JSON.parse(body.answer) : [];
    const pass = body.success === true && rows.length > 0;
    record("TEST-1-NATIONAL-OVERALL-RATING", '"best hospitals" (HTTP-observable: success + rows only; coverage not exposed by ChatResponse)', pass, { success: body.success, rowCount: rows.length, coverageInResponse: body.coverage });
  }

  // TEST 2 - Texas
  {
    const { body } = await ask("best hospitals in Texas");
    const rows = body.answer ? JSON.parse(body.answer) : [];
    const pass = body.success === true && rows.length > 0;
    record("TEST-2-TEXAS", '"best hospitals in Texas" (HTTP-observable: success + rows only)', pass, { success: body.success, rowCount: rows.length, coverageInResponse: body.coverage });
  }

  // TEST 3 - Mortality
  {
    const { body } = await ask("best hospitals for mortality");
    const rows = body.answer ? JSON.parse(body.answer) : [];
    const pass = body.success === true && rows.length > 0;
    record("TEST-3-MORTALITY", '"best hospitals for mortality" (HTTP-observable: success + rows only)', pass, { success: body.success, rowCount: rows.length, coverageInResponse: body.coverage });
  }

  // TEST 4 - Multi-metric
  {
    const { body } = await ask("Which hospitals have the best overall rating and lowest mortality?");
    const rows = body.answer ? JSON.parse(body.answer) : [];
    const pass = body.success === true && rows.length > 0;
    record("TEST-4-MULTI-METRIC", '"Which hospitals have the best overall rating and lowest mortality?" (HTTP-observable: success + rows only)', pass, { success: body.success, rowCount: rows.length, coverageInResponse: body.coverage });
  }

  // TEST 5 - Legitimate empty result
  {
    const { body } = await ask("hospitals in Wyoming with an overall rating of 1");
    const pass = body.success === true || (body.success === false && body.error && !/data.unavailable/i.test(body.error));
    record("TEST-5-LEGITIMATE-EMPTY", '"hospitals in Wyoming with an overall rating of 1"', pass, { body });
  }

  // TEST 6 - 8.6B regression
  {
    const { body } = await ask("mortality rate for Mountain View Hospital in Alabama");
    const pass = body.success === false && /No data is available/i.test(body.error ?? "") && body.coverage === undefined;
    record("TEST-6-8.6B-REGRESSION", '"mortality rate for Mountain View Hospital in Alabama"', pass, { body });
  }

  // TEST 7 - Ordinary ranking regression
  {
    const { body } = await ask("highest rated hospitals");
    const rows = body.answer ? JSON.parse(body.answer) : [];
    const pass = body.success === true && rows.length > 0;
    record("TEST-7-ORDINARY-RANKING", '"highest rated hospitals"', pass, { success: body.success, rowCount: rows.length, coverage: body.coverage });
  }

  // COVERAGE-INVARIANT and TOP-N-INDEPENDENCE cannot be observed at
  // the HTTP boundary at all (ChatResponse never forwards `coverage`,
  // pre-existing and unmodified) - both were already reconfirmed
  // against the real remote warehouse via the unchanged
  // scripts/verify-phase8.6c-coverage.ts (checks 8 and 9), using the
  // identical source now deployed as this same version. See the
  // deployment verification report for that run's output.

  console.log("=".repeat(80));
  console.log("PHASE 8.6C - REMOTE DEPLOYMENT VERIFICATION");
  console.log("=".repeat(80));

  let allPass = true;
  for (const c of checks) {
    const status = c.pass ? "PASS" : "FAIL";
    if (!c.pass) allPass = false;
    console.log(`[${status}] ${c.id} - ${c.description}`);
    console.log(`       ${c.detail}`);
  }

  console.log("=".repeat(80));
  console.log(allPass ? `ALL ${checks.length} CHECKS PASSED` : `FAILURES PRESENT (${checks.filter((c) => !c.pass).length}/${checks.length})`);

  if (!allPass) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
